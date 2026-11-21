// Drives the built app in a phone-sized browser through the patient's side:
// login, a check-in with text, a picture and one measure scored by the patient
// (saved exactly as picked, marked as hers, not changed by the analysis),
// reopening today's check-in (what was saved is shown; removing the picture and
// changing a score replaces the entry; a picture key from another day is
// refused), a check-in of scores alone, every measure scored (no follow-up),
// removing today's check-in (gone from the record and the graph), a suggestion
// with its reason, a request prepared, edited and sent, and the demo reset.
// Also: an entry of two random letters is not saved, and a fresh start and the
// state after the reset both show today as not yet reported. Exits non-zero on
// any failure.
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
/** The picked step for one measure, by the word on the button, e.g. pick("itchiness", 5). */
const pick = (measure, step) => page.locator(`button[data-measure=${measure}][data-step="${step}"]`).click();
// One save can be made to carry a picture key from another day, to prove it is refused.
let injectKey = null;
let injectLeft = 0; // the key goes into both steps of the save
await page.route("**/patient/checkin", async (route) => {
  const request = route.request();
  const type = request.headers()["content-type"] ?? "";
  const body = request.postDataBuffer();
  if (!injectKey || request.method() !== "POST" || !type.startsWith("multipart/form-data") || !body) return route.continue();
  const text = body.toString("latin1");
  const prefix = text.match(/name="((?:_?\d+_)?)keepImages"|name="((?:_?\d+_)?)text"/);
  const name = prefix?.[1] ?? prefix?.[2];
  // Only the save itself (it carries the text field), not the question lookup.
  if (name === undefined) return route.continue();
  const boundary = type.split("boundary=")[1];
  const part = `--${boundary}\r\nContent-Disposition: form-data; name="${name}keepImages"\r\n\r\n${injectKey}\r\n`;
  const at = body.lastIndexOf(Buffer.from(`--${boundary}--`));
  injectLeft -= 1;
  if (injectLeft === 0) injectKey = null;
  return route.continue({ postData: Buffer.concat([body.subarray(0, at), Buffer.from(part), body.subarray(at)]) });
});

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
  check("a fresh start shows today as not yet reported", !before.dates.includes(before.today) && before.entries.length === 0 && !/checked in today/i.test(homeText), JSON.stringify({ today: before.today, last: before.dates.at(-1) }));

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

  // 4. a real check-in: text, a picture and one measure scored by the patient herself
  await page.getByLabel("Your notes for today").fill(
    "Itching under the liner after a long walk this afternoon, quite a lot of it. It is sore where it rubs and uncomfortable to wear. I walked less than usual and took the stairs slowly.",
  );
  await page.getByTestId("picture-input").setInputFiles({ name: "skin.png", mimeType: "image/png", buffer: png(96, 72, [214, 160, 140]) });
  await page.getByAltText("Your picture 1").waitFor();
  // The scale is words, never a number: the step is picked by its word, and the word is shown.
  await page.getByRole("button", { name: "No itching" }).click();
  check("her pick is shown as a word, not a number", /No itching/.test(await page.getByTestId("picked-itchiness").innerText()));
  await page.getByTestId("picked-itchiness").scrollIntoViewIfNeeded();
  await shot("05-checkin-written");
  await page.locator("section[aria-labelledby=own-title]").screenshot({ path: path.join(screens, "05b-scoring-part.png") });
  await page.getByRole("button", { name: "Save my check-in" }).click();
  await page.getByText("Working on it").waitFor();
  await shot("06-checkin-working");
  await page.getByRole("heading", { name: "Saved. Here is what I recorded" }).waitFor();
  const recorded = await page.locator("body").innerText();
  check("the recorded measures are shown in words", /(No itching|Hardly any itching|Some itching|A lot of itching|Severe itching)/.test(recorded) && /Itchiness/.test(recorded));
  check("no bare numbers for the measures", !/(Itchiness|Comfort|Perceived mobility)\s*\n?\s*[1-5](\.\d)?\s*(\/|of)/.test(recorded));
  check("the recorded screen marks the figure she picked", /You picked this one/.test(recorded));
  await shot("07-checkin-recorded");
  const saved = await state();
  const entry = saved.entries.at(-1);
  check("the check-in is in the record with its words and picture", saved.entries.length === before.entries.length + 1 && entry?.images.length === 1 && /Itching/.test(entry.text), JSON.stringify(entry));
  check(
    "the measure she scored is saved exactly as she picked it, marked as hers, and the analysis did not change it",
    entry?.scores.itchiness === 5 && entry.ownScores?.itchiness === 5 && Object.keys(entry.ownScores).length === 1 && entry.scores.comfort !== null,
    JSON.stringify({ scores: entry?.scores, own: entry?.ownScores }),
  );

  // 5. reopen today's check-in: it shows what was saved
  await page.getByRole("button", { name: "Change this check-in" }).click();
  await page.getByAltText("Your picture 1").waitFor();
  const reopened = await page.getByLabel("Your notes for today").inputValue();
  check("the saved text is shown again", reopened === entry.text, reopened.slice(0, 60));
  check("the saved picture is shown again", (await page.getByAltText(/Your picture/).count()) === 1);
  check("the saved score is shown again", /No itching/.test(await page.getByTestId("picked-itchiness").innerText()));
  await shot("08-checkin-reopened");
  await page.goto(`${base}/patient/checkin`);
  await page.getByAltText("Your picture 1").waitFor();
  check("opening it from the start shows the same", (await page.getByLabel("Your notes for today").inputValue()) === entry.text && /No itching/.test(await page.getByTestId("picked-itchiness").innerText()));

  // 5b. take the picture out, change a score, try to slip in a picture from another day, save
  await page.getByRole("button", { name: "Remove picture 1" }).click();
  await pick("comfort", 4);
  injectKey = "patients/maria/images/seed-fit.jpg";
  injectLeft = 2;
  await page.getByRole("button", { name: "Save my changes" }).click();
  await page.getByRole("heading", { name: "Saved. Here is what I recorded" }).waitFor();
  check("the foreign picture key was sent with both steps of the save", injectLeft === 0);
  const replaced = await state();
  const entry2 = replaced.entries.at(-1);
  check(
    "saving replaced today's entry: one entry for today, no picture, comfort as picked, the earlier pick kept",
    replaced.entries.length === saved.entries.length && entry2.images.length === 0 && entry2.scores.comfort === 4 && entry2.ownScores.comfort === 4 && entry2.ownScores.itchiness === 5 && entry2.text === entry.text,
    JSON.stringify(entry2),
  );
  check("a picture key from another day is refused", !entry2.images.includes("patients/maria/images/seed-fit.jpg"), JSON.stringify(entry2.images));

  // 5c. every measure scored: no follow-up is asked, nothing is flagged as missing
  await page.getByRole("button", { name: "Change this check-in" }).click();
  await pick("mobility", 3);
  await shot("08b-checkin-all-scored");
  await page.getByRole("button", { name: "Save my changes" }).click();
  await page.getByRole("heading", { name: "Saved. Here is what I recorded" }).waitFor();
  const all = await page.locator("body").innerText();
  const entry3 = (await state()).entries.at(-1);
  check(
    "with every measure scored nothing is asked and nothing is flagged missing",
    Object.keys(entry3.ownScores).length === 3 && /Scored by you/.test(all) && !/One more thing|Not recorded/.test(all) && entry3.scores.itchiness === 5 && entry3.scores.comfort === 4 && entry3.scores.mobility === 3,
    JSON.stringify(entry3),
  );
  await shot("08c-recorded-all-scored");

  // 5d. remove today's check-in: it leaves the record and the graph
  const withToday = await state();
  await page.getByRole("button", { name: "Change this check-in" }).click();
  await page.getByRole("button", { name: "Remove today’s check-in" }).click();
  await shot("08d-remove-confirm");
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await page.waitForURL(`${base}/patient`);
  const removed = await state();
  check(
    "removing today's check-in takes it out of the record",
    withToday.dates.includes(withToday.today) && !removed.dates.includes(removed.today) && removed.entries.length === before.entries.length,
    JSON.stringify({ was: withToday.dates.at(-1), now: removed.dates.at(-1) }),
  );
  check("and home reads as not yet reported", !/checked in today/i.test(await page.locator("body").innerText()) && (await page.getByRole("link", { name: "Check in" }).count()) >= 1);
  await page.goto(`${base}/patient/history`);
  await page.getByRole("img", { name: /How well your prosthesis has been working/ }).waitFor();
  const graphText = await page.locator("body").innerText();
  const todayLabel = new Date(`${removed.today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  check("and the history and its graph end the day before", !graphText.includes(todayLabel), todayLabel);
  check("the graph names its scale and has dates along it", /Severe|Painful|Hardly getting about/.test(await page.locator("svg[role=img]").first().innerHTML()) && (await page.locator("svg[role=img] text").count()) > 6);

  // 5e. a check-in of scores alone saves
  await page.goto(`${base}/patient/checkin`);
  await page.getByText("Things worth thinking about first").waitFor();
  check("the button is off while there is nothing to save", await page.getByRole("button", { name: "Save my check-in" }).isDisabled());
  await pick("comfort", 2);
  await shot("08e-scores-alone");
  await page.getByRole("button", { name: "Save my check-in" }).click();
  await page.getByRole("heading", { name: "Saved. Here is what I recorded" }).waitFor();
  const scoresOnly = (await state()).entries.at(-1);
  check(
    "a check-in of scores alone is saved, as hers",
    scoresOnly.text === "" && scoresOnly.images.length === 0 && scoresOnly.scores.comfort === 2 && scoresOnly.ownScores.comfort === 2 && scoresOnly.scores.itchiness === null,
    JSON.stringify(scoresOnly),
  );
  await page.getByRole("button", { name: "That looks right" }).click();
  await page.waitForURL(`${base}/patient`);

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
  // 9. the demo reset: the clinician's reset puts today back to not yet reported
  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();
  await doctorPage.goto(`${base}/doctor/login`);
  await doctorPage.fill('input[name="password"]', process.env.DOCTOR_PASSWORD ?? env.DOCTOR_PASSWORD);
  await doctorPage.click('button:has-text("Log in")');
  await doctorPage.waitForURL(`${base}/doctor`);
  const reset = await doctorContext.request.post(`${base}/api/demo/reset`);
  check("the reset ran", reset.ok());
  const afterReset = await state();
  await page.goto(`${base}/patient`);
  await page.getByRole("link", { name: "Check in" }).first().waitFor();
  check(
    "after the reset today is not yet reported, and the first thing offered is a new check-in",
    !afterReset.dates.includes(afterReset.today) && afterReset.entries.length === 0 && !/checked in today/i.test(await page.locator("body").innerText()),
    JSON.stringify({ today: afterReset.today, last: afterReset.dates.at(-1) }),
  );
  await doctorContext.close();
} catch (error) {
  fail("the run", String(error?.stack ?? error));
  await shot("zz-failure").catch(() => {});
} finally {
  await browser.close();
  server?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll patient checks passed");
process.exit(failures ? 1 : 0);
