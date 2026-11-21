// Drives the built app in a phone-sized browser through the patient's side:
// login, a check-in with text and a picture, the recorded measures and one
// correction, a suggestion with its reason, a request prepared, edited and
// sent, and that request present in the record. Also: an entry of two random
// letters is not saved. Exits non-zero on any failure.
//
//   npm run build && node scripts/check-patient.mjs
//
// It starts its own `next start` on a free port with a fresh .data folder,
// using the passwords from .env.example, unless BASE_URL points at a server
// that is already running (then it uses PATIENT_PASSWORD from the environment).
// Screenshots at 390 px wide go to $SCREENS (default ./patient-screens).

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const screens = path.resolve(process.env.SCREENS ?? path.join(root, "patient-screens"));
mkdirSync(screens, { recursive: true });

const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.example"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

let failures = 0;
const ok = (name) => console.log(`PASS  ${name}`);
const fail = (name, why) => {
  failures += 1;
  console.log(`FAIL  ${name}: ${why}`);
};
function check(name, cond, why = "") {
  if (cond) ok(name);
  else fail(name, why || "condition was false");
}

/** A small solid PNG, made here so no real photograph is ever involved. */
function png(w, h, [r, g, b]) {
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let server = null;
let base = process.env.BASE_URL;
const password = process.env.PATIENT_PASSWORD ?? env.PATIENT_PASSWORD;
if (!base) {
  const port = 3100 + Math.floor(Math.random() * 800);
  base = `http://localhost:${port}`;
  rmSync(path.join(root, ".data"), { recursive: true, force: true });
  server = spawn(path.join(root, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, ...env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/patient/login`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
// The tab bar is fixed to the screen; in a full-page picture it would float mid-page, so it is
// laid in place at the bottom for the picture only.
const shot = async (name) => {
  await page.addStyleTag({ content: "nav[aria-label=Main]{position:static!important}" }).catch(() => {});
  await page.screenshot({ path: path.join(screens, `${name}.png`), fullPage: true });
};
const state = async () => (await context.request.get(`${base}/patient/api/state`)).json();

try {
  // 1. login
  await page.goto(`${base}/patient/login`);
  await shot("01-login");
  await page.fill('input[name="password"]', password);
  await page.click("button");
  await page.waitForURL(`${base}/patient`);
  ok("login");

  // 2. home: how things have been, one main action, a suggestion with its reason
  await page.getByRole("heading", { name: /Good|Hello/ }).waitFor();
  await page.getByText("How things have been lately").waitFor();
  await page.getByRole("link", { name: "Check in" }).waitFor();
  await page.getByText("Why:").first().waitFor();
  const homeText = await page.locator("body").innerText();
  check("home says how things have been in words", /harder|better|much like/.test(homeText), homeText.slice(0, 200));
  check("home offers a suggestion with its reason", /Why:/.test(homeText));
  check("home never shows a bare score label like 'Itchiness 5'", !/(Itchiness|Comfort|Mobility)\s+\d/.test(homeText));
  await shot("02-home");
  const before = await state();

  // 3. an entry that says nothing is never saved
  await page.goto(`${base}/patient/checkin`);
  await page.getByText("Things worth thinking about first").waitFor();
  await page.getByText(/Why these questions/).waitFor();
  await shot("03-checkin");
  await page.getByLabel("Your notes for today").fill("qx");
  await page.getByRole("button", { name: "Save my check-in" }).click();
  await page.getByTestId("checkin-error").waitFor();
  const refused = await page.getByTestId("checkin-error").innerText();
  check("two random letters are turned away on screen", /nothing was saved/i.test(refused), refused);
  const afterNoise = await state();
  check("two random letters are not in the record", afterNoise.entries.length === before.entries.length && afterNoise.entryCount === before.entryCount, JSON.stringify(afterNoise.entries));
  await shot("04-checkin-nothing-saved");

  // 4. a real check-in: text and a picture
  await page.getByLabel("Your notes for today").fill(
    "Itching under the liner after a long walk this afternoon, quite a lot of it. It is sore where it rubs and uncomfortable to wear. I walked less than usual and took the stairs slowly.",
  );
  await page.getByTestId("picture-input").setInputFiles({ name: "skin.png", mimeType: "image/png", buffer: png(96, 72, [214, 160, 140]) });
  await page.getByAltText("Your picture 1").waitFor();
  await shot("05-checkin-written");
  await page.getByRole("button", { name: "Save my check-in" }).click();
  await page.getByText("Working on it").waitFor();
  await shot("06-checkin-working");
  await page.getByText("Saved. Here is what I recorded").waitFor();
  const recorded = await page.locator("body").innerText();
  check("the recorded measures are shown in words", /(No itching|Hardly any itching|Some itching|A lot of itching|Severe itching)/.test(recorded) && /Itchiness/.test(recorded));
  check("no bare numbers for the measures", !/(Itchiness|Comfort|Perceived mobility)\s*\n?\s*[1-5](\.\d)?\s*(\/|of)/.test(recorded));
  await shot("07-checkin-recorded");
  const saved = await state();
  const entry = saved.entries.at(-1);
  check("the check-in is in the record with its words and picture", saved.entries.length === before.entries.length + 1 && entry?.images.length === 1 && /Itching/.test(entry.text), JSON.stringify(entry));
  const comfortBefore = entry?.scores.comfort;

  // 5. correct one measure
  await page.getByRole("button", { name: "Change" }).nth(1).click();
  await shot("08-checkin-correcting");
  await page.getByRole("button", { name: /^Completely comfortable/ }).click();
  await page.getByRole("button", { name: "Save my changes" }).click();
  await page.waitForURL(`${base}/patient`);
  const corrected = (await state()).entries.at(-1);
  check("one measure was corrected and saved", corrected?.scores.comfort === 5 && comfortBefore !== 5 && corrected.corrected === true, `before ${comfortBefore}, after ${corrected?.scores.comfort}`);

  // 6. suggestions after the check-in
  await page.getByText("Why:").first().waitFor();
  check("a suggestion is visible with its reason", (await page.getByText("Why:").count()) >= 1);
  await shot("09-home-after-checkin");

  // 7. a request: prepared, edited, sent
  await page.getByRole("link", { name: "Clinic" }).click();
  await page.waitForURL(`${base}/patient/clinic`);
  await shot("10-clinic");
  await page.getByRole("link", { name: "Ask for a check-up" }).first().click();
  await page.getByText("This is what the clinic will read").waitFor();
  const draft = await page.getByLabel("What has changed").inputValue();
  check("the request is prepared from the record", draft.length > 80 && /(\d+ \w{3})/.test(draft), draft);
  await shot("11-request-prepared");
  await page.getByLabel("In one line").fill("Rubbing and itching worse over the last weeks (edited by the patient)");
  await page.getByLabel("What has changed").fill(`${draft}\n\nI also noticed it is worse in the afternoon.`);
  await shot("12-request-edited");
  await page.getByRole("button", { name: "Send to the clinic" }).click();
  await page.getByText("Sent. The clinic has your request.").waitFor();
  await shot("13-request-sent");
  const after = await state();
  const sent = after.requests.find((r) => r.headline.includes("edited by the patient"));
  check(
    "the sent request is present through listRequests, edited, status sent",
    Boolean(sent) && sent.status === "sent" && sent.body.includes("worse in the afternoon") && sent.reply === null && sent.patientId === "maria",
    JSON.stringify(sent),
  );
  check("the request carries days and a picture", Boolean(sent) && sent.evidenceDates.length > 0 && sent.images.length > 0, JSON.stringify({ d: sent?.evidenceDates, i: sent?.images }));

  // 8. history and the other screens
  await page.goto(`${base}/patient/history`);
  await page.getByRole("img", { name: /How well your prosthesis has been working/ }).waitFor();
  await page.waitForTimeout(400);
  await shot("14-history");
  await page.getByRole("button", { name: "1 year" }).click();
  await page.waitForTimeout(300);
  await shot("15-history-year");
  await page.getByRole("button", { name: "See what it is made of" }).click();
  await page.waitForTimeout(1200);
  await shot("16-history-apart");
  const histText = await page.locator("body").innerText();
  check("the history shows a day's words and a way to move the window", /What you wrote/.test(histText) && (await page.getByRole("button", { name: "Show earlier" }).count()) === 1);
  await page.goto(`${base}/patient/clinic/${sent.id}`);
  await page.getByText("Where it stands").waitFor();
  await shot("17-request-status");
  await page.goto(`${base}/patient/settings`);
  await page.getByText("Who reads your words").waitFor();
  await shot("18-settings");
} catch (error) {
  fail("the run", String(error?.stack ?? error));
  await shot("zz-failure").catch(() => {});
} finally {
  await browser.close();
  server?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll patient checks passed");
process.exit(failures ? 1 : 0);
