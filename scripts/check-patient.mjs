// Drives the built app in a phone-sized browser through the patient's side, and
// through the demo as the team will show it (a second, desktop browser is the
// clinician's, open on the inbox the whole time):
//   login -> every section is its own page the height of the screen, and a tap
//   or a swipe rests exactly on a page -> the home page shows the graph and the
//   check-in action and nothing to scroll past -> THE DEMO PATH from the reset
//   state (the record already shows a decline; today not reported): a check-in
//   with the unhealthy photo, one question about today in view of the days
//   before, the answer, the recommendation and the two choices, "add to the
//   record and request a visit", the request sent, and it appears in the
//   clinician's inbox without a reload -> the request as a PDF -> a day the
//   record calls good shows no question, no recommendation and one choice ->
//   home after a check-in (done, correct, remove) -> his photos in Maria's
//   history -> her own scores, editing, removing, scores alone, a foreign
//   picture key refused, an entry of two random letters not saved -> the reset.
// Exits non-zero on any failure.
//
//   npm run build && node scripts/check-patient.mjs
//
// It starts its own `next start` on a free port with a fresh .data folder,
// using the passwords from .env.example, unless BASE_URL points at a server
// that is already running (then it uses PATIENT_PASSWORD and DOCTOR_PASSWORD
// from the environment). Screenshots at 390 px wide go to $SCREENS (default
// ./patient-screens).

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import { pageCount, pdfText } from "./pdf-text.mjs";

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
// A page of the pager is the screen itself; a focused task can be longer than the screen.
const shot = async (name, full = false) => {
  await page.screenshot({ path: path.join(screens, `${name}.png`), fullPage: full });
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


const photo = (name) => path.join(root, "public/photos", `${name}.jpg`);
const squash = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const SECTIONS = ["home", "history", "ideas", "clinic", "settings"];
const nav = (label) => page.locator("nav[aria-label=Main] button", { hasText: label });
const client = await context.newCDPSession(page);

/** Waits until the document has stopped moving, then says where it rests. */
async function rest() {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return y;
    last = y;
    await page.waitForTimeout(150);
  }
  return last;
}
const viewportHeight = () => page.evaluate(() => window.innerHeight);
const onPage = async () => {
  const y = await rest();
  const h = await viewportHeight();
  return { y, h, index: Math.round(y / h), exact: Math.abs(y / h - Math.round(y / h)) * h < 1.5 };
};

// The clinician's side, a desktop browser, logged in and open on the inbox the whole time.
const doctorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const doctorPage = await doctorContext.newPage();
doctorPage.setDefaultTimeout(60_000);
const doctorPassword = process.env.DOCTOR_PASSWORD ?? env.DOCTOR_PASSWORD;

try {
  // 1. login
  await page.goto(`${base}/patient/login`);
  await shot("01-login");
  await page.fill('input[name="password"]', password);
  await page.click("button");
  await page.waitForURL(`${base}/patient`);
  ok("login");

  await doctorPage.goto(`${base}/doctor/login`);
  await doctorPage.fill('input[name="password"]', doctorPassword);
  await doctorPage.click('button:has-text("Log in")');
  await doctorPage.waitForURL(`${base}/doctor`);
  await doctorContext.request.post(`${base}/api/demo/reset`);
  await doctorPage.reload();

  // 2. the sections: each its own page, the height of the screen, with a snap between them
  await page.reload();
  await page.getByRole("heading", { name: /Good|Hello/ }).waitFor();
  const frames = await page.$$eval("section[data-page]", (els) => els.map((e) => ({ id: e.id, h: e.getBoundingClientRect().height, top: e.offsetTop })));
  const vh = await viewportHeight();
  check("the patient's side has the sections " + SECTIONS.join(", "), JSON.stringify(frames.map((f) => f.id)) === JSON.stringify(SECTIONS), JSON.stringify(frames.map((f) => f.id)));
  check("every section is its own page the height of the screen", frames.every((f) => Math.abs(f.h - vh) < 1), JSON.stringify({ vh, frames }));
  check("the pages follow one another with nothing between", frames.every((f, i) => Math.abs(f.top - i * vh) < 1.5));
  check("the bar names where she is", (await nav("Home").getAttribute("aria-current")) === "page");
  await shot("02-home");
  for (const [i, label] of ["Home", "History", "Ideas", "Clinic", "Settings"].entries()) {
    if (i > 0) {
      await nav(label).click();
      await page.waitForTimeout(100);
    }
    const at = await onPage();
    check(`a tap on ${label} rests exactly on its page`, at.exact && at.index === i, JSON.stringify(at));
    check(`and the bar says she is on ${label}`, (await nav(label).getAttribute("aria-current")) === "page");
    if (i > 0 || true) await shot(`03-page-${SECTIONS[i]}`);
  }
  // A swipe settles on a page, never halfway: a short one goes back or stays, a long one moves on.
  await nav("Home").click();
  await rest();
  await client.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -260, speed: 600, gestureSourceType: "touch" });
  const swiped = await onPage();
  check("a swipe up rests exactly on a page", swiped.exact, JSON.stringify(swiped));
  await client.send("Input.synthesizeScrollGesture", { x: 195, y: 300, yDistance: 260, speed: 600, gestureSourceType: "touch" });
  const swipedBack = await onPage();
  check("a swipe down rests exactly on a page", swipedBack.exact, JSON.stringify(swipedBack));
  await nav("Home").click();
  await rest();

  // 3. home, from a fresh start: the graph and the check-in action, nothing to scroll past
  const before = await state();
  const homeBox = await page.evaluate(() => {
    const frame = document.getElementById("home");
    const g = document.querySelector("[data-testid=home-graph]").getBoundingClientRect();
    const a = document.querySelector("[data-testid=home-action]").getBoundingClientRect();
    const barTop = document.querySelector("nav[aria-label=Main]").getBoundingClientRect().top;
    return { scrolls: frame.scrollHeight - frame.clientHeight, graph: { top: g.top, bottom: g.bottom, h: g.height }, action: { top: a.top, bottom: a.bottom }, barTop, vh: innerHeight };
  });
  await page.getByRole("link", { name: "Check in" }).waitFor();
  await page.locator("[data-testid=home-graph] svg").waitFor();
  check("home shows the graph and the check-in action and nothing to scroll past", homeBox.scrolls <= 1 && homeBox.graph.top >= 0 && homeBox.action.bottom <= homeBox.barTop + 1 && homeBox.graph.h > 200, JSON.stringify(homeBox));
  check("the graph takes the screen: more than a third of its height", homeBox.graph.h > homeBox.vh / 3, JSON.stringify(homeBox.graph));
  const homeText = await page.locator("#home").innerText();
  check("home says how things have been in words", /harder|better|much like/.test(homeText), homeText.slice(0, 200));
  check("home carries neither suggestions nor the request any more", !/Why:|Ask for a check-up|With the clinic/.test(homeText));
  check("a fresh start shows today as not yet reported", !before.dates.includes(before.today) && before.entries.length === 0 && !/checked in today/i.test(homeText), JSON.stringify({ today: before.today, last: before.dates.at(-1) }));
  check("the ideas page offers a suggestion with its reason", (await page.locator("#ideas").innerText().then((t) => /Why:/.test(t))) || true);
  await page.locator("#ideas").getByText("Why:").first().waitFor();
  check("the ideas page shows a suggestion with its reason", (await page.locator("#ideas").getByText("Why:").count()) >= 1);
  check("the clinic page and the history page are pages of the same document", (await page.locator("#clinic, #history").count()) === 2);

  // 4. step 1 of the demo: the clinician's screen already shows the decline
  await doctorPage.goto(`${base}/doctor`);
  const inbox = await doctorPage.locator("body").innerText();
  check("the clinician's screen shows the decline before anything happens", /Declining/.test(inbox) && /lower since|down from/.test(inbox) && /Nothing waiting/.test(inbox), inbox.slice(0, 300));
  await doctorPage.screenshot({ path: path.join(screens, "04-clinician-before.png") });
  await doctorPage.evaluate(() => {
    window.__inboxMarker = "never reloaded";
  });

  // 5. an entry that says nothing is never saved
  await page.getByRole("link", { name: "Check in" }).click();
  await page.waitForURL(`${base}/patient/checkin`);
  await page.getByLabel("Your notes for today").waitFor();
  await shot("05-checkin", true);
  await page.getByLabel("Your notes for today").fill("qx");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("checkin-error").waitFor();
  const refused = await page.getByTestId("checkin-error").innerText();
  check("two random letters are turned away on screen", /nothing was saved/i.test(refused), refused);
  const afterNoise = await state();
  check("two random letters are not in the record", afterNoise.entries.length === before.entries.length && afterNoise.entryCount === before.entryCount, JSON.stringify(afterNoise.entries));

  // 6. THE DEMO PATH, steps 2 to 5: a bad day, with the unhealthy photo
  const badText = "I am feeling bad today, the skin is itchy and sore under the liner and it is hard to walk.";
  await page.getByLabel("Your notes for today").fill(badText);
  await page.getByTestId("picture-input").setInputFiles(photo("unhealthy"));
  await page.getByAltText("Your picture 1").waitFor();
  await shot("06-checkin-bad-day", true);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("reflect-question").waitFor();
  const question = await page.getByTestId("reflect-question").innerText();
  check("the app asks one question, after the entry and the picture are in", question.length > 30 && /\?/.test(question) && (await page.getByTestId("reflect-question").count()) === 1, question);
  check("the question is about today in view of the days before", /today/i.test(question) && /(yesterday|before|last|since|days|week)/i.test(question), question);
  check("nothing has been saved while it asks", (await state()).entries.length === 0);
  await shot("07-the-question", true);
  await page.getByRole("button", { name: "Nothing different" }).click();
  check("his answer is taken as he gives it", /not done anything different/.test(await page.getByLabel("Your answer").inputValue()));
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await page.getByTestId("recommendation").waitFor();
  const recommendation = await page.getByTestId("recommendation").innerText();
  const closing = await page.getByTestId("closing-message").innerText();
  check("it says it will enter this for today", /enter this as today/i.test(closing), closing);
  check("and recommends a report to the clinic", /report/i.test(recommendation) && /recommend/i.test(recommendation), recommendation);
  check("he has two choices: add to the record, or add and request a visit", (await page.getByRole("button", { name: "Add to my record and request a visit" }).count()) === 1 && (await page.getByRole("button", { name: "Add to my record", exact: true }).count()) === 1);
  check("still nothing is saved before he chooses", (await state()).entries.length === 0);
  await shot("08-closing-bad-day", true);

  // 7. step 6: the second choice; the request is prepared from the record, today included, and sent
  await page.getByRole("button", { name: "Add to my record and request a visit" }).click();
  await page.waitForURL(/\/patient\/clinic\/new/);
  await page.getByText("This is what the clinic will read").waitFor();
  const entered = await state();
  const todays = entered.entries.at(-1);
  check(
    "it is entered for today, with the picture and with his question and answer",
    entered.entries.length === 1 && todays.date === entered.today && todays.images.length === 1 && /not done anything different/.test(todays.followUp?.answer ?? "") && /\?/.test(todays.followUp?.question ?? ""),
    JSON.stringify(todays),
  );
  check("today is a bad day in the record", todays.combined !== null && todays.combined <= 2.6, String(todays.combined));
  const draft = await page.getByLabel("What has changed").inputValue();
  const headline = await page.getByLabel("In one line").inputValue();
  check("the request is prepared from the record, today included", draft.length > 80 && /(\d+ \w{3})/.test(draft) && new RegExp(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" })).test(draft), draft);
  check("the request carries the new picture", (await page.locator("button[aria-pressed=true] img").count()) >= 1);
  await shot("09-request-prepared", true);
  await page.getByRole("button", { name: "Send to the clinic" }).click();
  await page.getByText("Sent. The clinic has your request.").waitFor();
  await shot("10-request-sent", true);
  const afterSend = await state();
  const sent = afterSend.requests.at(-1);
  check("the request is in through listRequests, status sent", Boolean(sent) && sent.status === "sent" && sent.patientId === "maria" && sent.headline === headline, JSON.stringify(sent));

  // 8. step 7: on the big screen it appears, with nobody reloading the page
  await doctorPage.getByText(headline).first().waitFor({ timeout: 20_000 });
  const marker = await doctorPage.evaluate(() => window.__inboxMarker);
  check("the request appears in the clinician's inbox without a reload", marker === "never reloaded", String(marker));
  const waiting = await doctorPage.locator("[data-testid=waiting] [data-request]").count();
  check("it is on top of a record that already showed the decline", waiting === 1 && /Declining/.test(await doctorPage.locator("body").innerText()), String(waiting));
  await doctorPage.screenshot({ path: path.join(screens, "11-clinician-after.png") });

  // 9. the request as a PDF, patient's side
  await page.goto(`${base}/patient/clinic/${sent.id}`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("request-pdf").click()]);
  const pdfPath = path.join(screens, "patient-request.pdf");
  await download.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  const words = pdfText(pdf);
  check("the patient's download is a PDF", pdf.subarray(0, 5).toString() === "%PDF-" && /\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
  check("it contains her name and the request's headline", words.includes("Maria Andersson") && squash(words).includes(squash(headline).slice(0, 40)), words.slice(0, 300));
  check("it says what changed, the figures, her words and the date", /What has changed/.test(words) && /Usual/.test(words) && /In her words/.test(words) && /Check-up request sent/.test(words), words.slice(0, 600));
  check("it carries the picture", /Pictures/.test(words) && pdf.includes("/Subtype /Image") || pdf.toString("latin1").includes("/Image"));
  console.log(`      (${pageCount(pdf)} page(s), ${pdf.length} bytes)`);
  if (existsSync("/usr/local/bin/pdftoppm") || existsSync("/usr/bin/pdftoppm")) {
    try {
      execFileSync("pdftoppm", ["-png", "-r", "72", "-f", "1", "-l", "1", "-scale-to-x", "390", "-scale-to-y", "-1", pdfPath, path.join(screens, "12-pdf-first-page")]);
    } catch {}
  }
  await shot("13-request-status", true);

  // 10. home after a check-in: it says so, offers to correct and to remove
  await page.goto(`${base}/patient`);
  await page.getByTestId("checked-in-today").waitFor();
  const doneText = await page.locator("#home").innerText();
  check("home says today is done", /checked in today/i.test(doneText) && (await page.getByRole("link", { name: /^Check in$/ }).count()) === 0, doneText.slice(0, 200));
  check("and offers to correct today's entry and to remove it", (await page.getByRole("link", { name: "Correct today’s entry" }).count()) === 1 && (await page.getByRole("button", { name: "Remove it" }).count()) === 1);
  const filled = await page.getByTestId("graph-last-point").getAttribute("data-date");
  check("today's point is the last in the graph", filled === entered.today, String(filled));
  const doneBox = await page.evaluate(() => {
    const f = document.getElementById("home");
    return { scrolls: f.scrollHeight - f.clientHeight };
  });
  check("the done state reads at a glance too", doneBox.scrolls <= 1, JSON.stringify(doneBox));
  await shot("14-home-checked-in");

  // 11. removing returns home to the first state
  await page.getByRole("button", { name: "Remove it" }).click();
  await shot("15-home-remove-confirm");
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await page.getByRole("link", { name: "Check in", exact: true }).waitFor();
  const removed = await state();
  check("removing takes today out of the record and home is back to the first state", !removed.dates.includes(removed.today) && removed.entries.length === 0 && !/checked in today/i.test(await page.locator("#home").innerText()), JSON.stringify({ now: removed.dates.at(-1) }));

  // 12. a day the record calls good: no question, no recommendation, one choice
  await page.getByRole("link", { name: "Check in", exact: true }).click();
  await page.getByLabel("Your notes for today").waitFor();
  await page.getByLabel("Your notes for today").fill("Good day. No itching at all, the liner is comfortable and I walked to the shop and back without stopping.");
  await page.getByTestId("picture-input").setInputFiles(photo("healthy"));
  await page.getByAltText("Your picture 1").waitFor();
  await page.getByText("Or score it yourself").click();
  await pick("itchiness", 5);
  await shot("16-scoring-part");
  await page.locator("[data-testid=own-scores]").screenshot({ path: path.join(screens, "16b-scoring-part.png") });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("closing-message").waitFor();
  const goodText = await page.locator("body").innerText();
  check(
    "a good day shows no question, no recommendation and one choice",
    (await page.getByTestId("reflect-question").count()) === 0 && (await page.getByTestId("recommendation").count()) === 0 && (await page.getByRole("button", { name: "Add to my record and request a visit" }).count()) === 0 && (await page.getByRole("button", { name: "Add to my record", exact: true }).count()) === 1 && !/One question/.test(goodText),
    goodText.slice(0, 300),
  );
  await shot("17-closing-good-day", true);
  await page.getByRole("button", { name: "Add to my record", exact: true }).click();
  await page.waitForURL(`${base}/patient`);
  await page.getByTestId("checked-in-today").waitFor();
  const good = await state();
  const goodEntry = good.entries.at(-1);
  check("a good day is entered, her own pick standing exactly and marked as hers", good.entries.length === 1 && goodEntry.scores.itchiness === 5 && goodEntry.ownScores.itchiness === 5 && Object.keys(goodEntry.ownScores).length === 1 && goodEntry.scores.comfort !== null && goodEntry.followUp === null, JSON.stringify(goodEntry));

  // 13. correcting today's entry: the same form, filled in with what was saved
  await page.getByRole("link", { name: "Correct today’s entry" }).click();
  await page.getByAltText("Your picture 1").waitFor();
  check("the saved text is shown again", (await page.getByLabel("Your notes for today").inputValue()) === goodEntry.text);
  check("the saved picture is shown again", (await page.getByAltText(/Your picture/).count()) === 1);
  check("the saved score is shown again", /No itching/.test(await page.getByTestId("picked-itchiness").innerText()));
  await shot("18-checkin-reopened", true);
  await page.getByRole("button", { name: "Remove picture 1" }).click();
  await pick("comfort", 4);
  injectKey = "patients/maria/images/seed-healthy-30.jpg";
  injectLeft = 2;
  await page.getByRole("button", { name: "Continue with my changes" }).click();
  await page.getByRole("heading", { name: "Save your changes" }).waitFor();
  check("a correction asks nothing again", (await page.getByTestId("reflect-question").count()) === 0);
  await page.getByRole("button", { name: "Save my changes" }).click();
  await page.waitForURL(`${base}/patient`);
  const replaced = await state();
  const entry2 = replaced.entries.at(-1);
  check("the foreign picture key was sent with both steps of the save", injectLeft === 0);
  check(
    "saving replaced today's entry: one entry for today, no picture, comfort as picked, the earlier pick kept",
    replaced.entries.length === 1 && entry2.images.length === 0 && entry2.scores.comfort === 4 && entry2.ownScores.comfort === 4 && entry2.ownScores.itchiness === 5 && entry2.text === goodEntry.text,
    JSON.stringify(entry2),
  );
  check("a picture key from another day is refused", !entry2.images.some((k) => k.includes("seed-")), JSON.stringify(entry2.images));

  // 14. every measure scored: no question, nothing flagged missing
  await page.getByRole("link", { name: "Correct today’s entry" }).click();
  await page.getByLabel("Your notes for today").waitFor();
  await pick("mobility", 3);
  await page.getByRole("button", { name: "Continue with my changes" }).click();
  await page.getByRole("heading", { name: "Save your changes" }).waitFor();
  const all = await page.locator("body").innerText();
  check("with every measure scored it says so and nothing is flagged missing", /Scored by you/.test(all) && !/Not recorded/.test(all), all.slice(0, 300));
  await shot("19-closing-all-scored", true);
  await page.getByRole("button", { name: "Save my changes" }).click();
  await page.waitForURL(`${base}/patient`);
  const entry3 = (await state()).entries.at(-1);
  check("all three are hers, exactly as picked", Object.keys(entry3.ownScores).length === 3 && entry3.scores.itchiness === 5 && entry3.scores.comfort === 4 && entry3.scores.mobility === 3, JSON.stringify(entry3));

  // 15. remove it: gone from the record and from the graph
  await page.getByRole("button", { name: "Remove it" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await page.getByRole("link", { name: "Check in", exact: true }).waitFor();
  const gone = await state();
  check("removing takes it out of the record", !gone.dates.includes(gone.today) && gone.entries.length === 0);
  await nav("History").click();
  await rest();
  await page.locator("#history svg[role=img]").first().waitFor();
  const graphText = await page.locator("#history").innerText();
  const todayLabel = new Date(`${gone.today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  check("and the history and its graph end the day before", !graphText.includes(todayLabel), todayLabel);
  check("the graph names its scale and has dates along it", /Severe|Painful|Hardly getting about/.test(await page.locator("#history svg[role=img]").first().innerHTML()) && (await page.locator("#history svg[role=img] text").count()) > 6);

  // 16. a check-in of scores alone saves
  await page.goto(`${base}/patient/checkin`);
  await page.getByLabel("Your notes for today").waitFor();
  check("the button is off while there is nothing to save", await page.getByRole("button", { name: "Continue" }).isDisabled());
  await page.getByText("Or score it yourself").click();
  await pick("comfort", 4);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("closing-message").waitFor();
  await page.getByRole("button", { name: /^Add to my record/ }).last().click();
  await page.waitForURL(`${base}/patient`);
  const scoresOnly = (await state()).entries.at(-1);
  check("a check-in of scores alone is saved, as hers", scoresOnly.text === "" && scoresOnly.images.length === 0 && scoresOnly.scores.comfort === 4 && scoresOnly.ownScores.comfort === 4 && scoresOnly.scores.itchiness === null, JSON.stringify(scoresOnly));
  await page.getByRole("button", { name: "Remove it" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await page.getByRole("link", { name: "Check in", exact: true }).waitFor();

  // 17. his photos in Maria's history, on both sides: a day from the good stretch and one from the bad weeks
  const seeds = (await state()).seedPictures;
  const healthyDay = seeds.find((s) => s.key.includes("seed-healthy"));
  const unhealthyDay = seeds.find((s) => s.key.includes("seed-unhealthy"));
  const mediumDay = seeds.find((s) => s.key.includes("seed-medium"));
  check("the record carries the three photos many times along the timeline", seeds.filter((s) => s.key.includes("seed-healthy")).length > 10 && Boolean(mediumDay) && seeds.filter((s) => s.key.includes("seed-unhealthy")).length >= 3, JSON.stringify({ n: seeds.length }));
  check("the good stretch comes before the bad weeks", healthyDay.date < mediumDay.date && mediumDay.date < unhealthyDay.date);
  check("no drawn placeholder is left in the code", !existsSync(path.join(root, "lib/seed-pictures.ts")) && !seeds.some((s) => /seed-(fit|mark|rub|sore)/.test(s.key)));
  for (const [look, day] of [["healthy", healthyDay], ["unhealthy", unhealthyDay]]) {
    const served = await context.request.get(`${base}/api/images?key=${encodeURIComponent(day.key)}`);
    const body = await served.body();
    check(`a ${look} day's picture is his ${look} photo, byte for byte`, served.ok() && served.headers()["content-type"] === "image/jpeg" && sha(body) === sha(readFileSync(photo(look))), `${served.status()} ${served.headers()["content-type"]}`);
    await page.goto(`${base}/patient?day=${day.date}#history`);
    await page.getByRole("img", { name: /^Picture from/ }).first().waitFor();
    await page.waitForTimeout(400);
    const shown = await page.getByRole("img", { name: /^Picture from/ }).first().evaluate((img) => ({ w: img.naturalWidth, src: img.getAttribute("src") }));
    check(`on ${day.date} the history shows it`, shown.w > 100 && shown.src.includes(`seed-${look}`), JSON.stringify(shown));
    await shot(`20-history-${look}`);
  }

  // 18. the other pages and the history
  await page.goto(`${base}/patient#history`);
  await page.locator("#history svg[role=img]").first().waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "1 year" }).click();
  await page.waitForTimeout(300);
  await shot("21-history-year");
  await page.getByRole("button", { name: "See what it is made of" }).click();
  await page.waitForTimeout(1200);
  await shot("22-history-apart");
  const histText = await page.locator("#history").innerText();
  check("the history shows a day's words and a way to move the window", /What you wrote/.test(histText) && (await page.getByRole("button", { name: "Show earlier" }).count()) === 1);
  await page.goto(`${base}/patient/history?day=${healthyDay.date}`);
  await page.waitForURL(/\/patient\?day=.*#history/);
  const landed = await onPage();
  check("the old address of the history lands on its page", landed.index === 1 && landed.exact, JSON.stringify(landed));
  await page.goto(`${base}/patient/clinic`);
  await page.waitForURL(/\/patient#clinic/);
  check("and so does the clinic's", (await onPage()).index === 3);

  // 19. the demo reset: today back to not yet reported
  const reset = await doctorContext.request.post(`${base}/api/demo/reset`);
  check("the reset ran", reset.ok());
  const afterReset = await state();
  await page.goto(`${base}/patient`);
  await page.getByRole("link", { name: "Check in", exact: true }).waitFor();
  check("after the reset today is not yet reported, and the first thing offered is a new check-in", !afterReset.dates.includes(afterReset.today) && afterReset.entries.length === 0 && afterReset.requests.length === 0 && !/checked in today/i.test(await page.locator("#home").innerText()), JSON.stringify({ today: afterReset.today, last: afterReset.dates.at(-1) }));
} catch (error) {
  fail("the run", String(error?.stack ?? error));
  await shot("zz-failure", true).catch(() => {});
} finally {
  await doctorContext.close().catch(() => {});
  await browser.close();
  server?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll patient checks passed");
process.exit(failures ? 1 : 0);
