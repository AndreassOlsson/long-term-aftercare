import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";

// Where entries and pictures are kept. On Vercel this is the project's Blob
// store (private access). Without a Blob token it falls back to files on
// disk, which is what local development uses.

export type StorageKind = "blob" | "disk" | "temporary";

export function storageKind(): StorageKind {
  // A connected store shows up either as a read-write token or, on newer
  // projects, as a store id that the SDK pairs with Vercel's own identity.
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "blob";
  // On Vercel without a Blob store the only writable place is the temp
  // folder, which is wiped between invocations: nothing really persists.
  return process.env.VERCEL ? "temporary" : "disk";
}

const diskRoot = () =>
  storageKind() === "temporary"
    ? path.join(os.tmpdir(), "long-term-aftercare")
    : path.join(process.cwd(), ".data");

function diskPath(key: string): string {
  const full = path.join(diskRoot(), key);
  if (!full.startsWith(diskRoot() + path.sep)) throw new Error("Bad storage key");
  return full;
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  if (storageKind() === "blob") {
    await put(key, body, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  const file = diskPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function getObject(
  key: string,
  /** Set for files that get rewritten in place, to skip the CDN's copy. */
  options: { fresh?: boolean } = {},
): Promise<{ body: Buffer; contentType: string } | null> {
  if (storageKind() === "blob") {
    const result = await get(key, { access: "private", useCache: !options.fresh });
    if (!result || !result.stream) return null;
    const body = Buffer.from(await new Response(result.stream).arrayBuffer());
    return {
      body,
      contentType: result.blob.contentType ?? "application/octet-stream",
    };
  }
  try {
    const body = await fs.readFile(diskPath(key));
    const contentType = key.endsWith(".json") ? "application/json" : "image/jpeg";
    return { body, contentType };
  } catch {
    return null;
  }
}

/** Keys under a prefix. */
export async function listKeys(prefix: string): Promise<string[]> {
  if (storageKind() === "blob") {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      keys.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }
  try {
    const names = await fs.readdir(diskPath(prefix));
    return names.map((name) => `${prefix}${name}`);
  } catch {
    return [];
  }
}

/** Removes one stored object. A key that is not there is not an error. */
export async function deleteObject(key: string): Promise<void> {
  if (storageKind() === "blob") {
    await del(key);
    return;
  }
  await fs.rm(diskPath(key), { force: true });
}

/**
 * Removes everything stored under a prefix, for putting the demo back to its
 * starting state. Returns how many objects went.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  const keys = await listKeysDeep(prefix);
  await Promise.all(keys.map((key) => deleteObject(key)));
  return keys.length;
}

// listKeys on disk reads one folder level; this walks the folders below it.
async function listKeysDeep(prefix: string): Promise<string[]> {
  if (storageKind() === "blob") return listKeys(prefix);
  const found: string[] = [];
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await fs.readdir(diskPath(dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const key = `${dir}${entry.name}`;
      if (entry.isDirectory()) await walk(`${key}/`);
      else found.push(key);
    }
  };
  await walk(prefix);
  return found;
}
