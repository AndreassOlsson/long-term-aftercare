// Reads the text out of a PDF the app made, without a PDF library: inflates the
// page streams and collects what the text operators draw. Enough to check that
// a document says what it should; not a general PDF reader.
import zlib from "node:zlib";

export function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  const out = [];
  let from = 0;
  for (;;) {
    const s = raw.indexOf("stream", from);
    if (s < 0) break;
    const start = raw[s + 6] === "\r" ? s + 8 : s + 7;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const body = buffer.subarray(start, end);
    let text = null;
    try {
      text = zlib.inflateSync(body).toString("latin1");
    } catch {
      text = body.toString("latin1");
    }
    if (/\bTj\b|\bTJ\b/.test(text)) {
      for (const m of text.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
        if (m[1] !== undefined) out.push(Buffer.from(m[1].replace(/\s+/g, ""), "hex").toString("latin1"));
        else out.push(m[2].replace(/\\(.)/g, "$1"));
      }
      out.push("\n");
    }
    from = end + 9;
  }
  return out.join(" ").replace(/[ ]+/g, " ");
}

export const pageCount = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
