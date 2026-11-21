// Drives the built clinician side in a desktop-sized browser:
//   sample request saved -> login -> it tops the inbox with its reason ->
//   opening it marks it seen -> an evidence day opens from it -> an offered
//   time is sent (answered, reply readable through getRequest) -> the reset
//   puts the stored data back to the starting state. Also: a check-in in
//   which the patient scored one measure herself shows in the record and in
//   the day as picked by the patient.
// Run after `npm run build`. It starts the app itself on a free port with the
// passwords from .env.example, or uses BASE_URL (with DOCTOR_PASSWORD) when set.
// SHOTS_DIR=<folder> also saves a 1280 px screenshot of every screen.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.example"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

let server = null;
let base = process.env.BASE_URL;
if (!base) {
  const port = 3100 + Math.floor(Math.random() * 400);
  base = `http://localhost:${port}`;
  // A scratch data folder, so a check never touches the developer's own data.
  const cwd = root;
  rmSync(path.join(cwd, ".data"), { recursive: true, force: true });
  server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd,
    env: { ...process.env, ...env, ANTHROPIC_API_KEY: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/doctor/login`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}
const password = process.env.DOCTOR_PASSWORD ?? env.DOCTOR_PASSWORD;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const shoot = async (name) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
};
const api = (p, method = "GET") => context.request.fetch(`${base}${p}`, { method });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // Login (and the login screen).
  await page.goto(`${base}/doctor`);
  check("an unauthenticated visit goes to the login", page.url().endsWith("/doctor/login"));
  await shoot("01-login");
  const unauth = await fetch(`${base}/api/demo/reset`, { method: "POST" });
  check("the reset refuses a visitor who is not logged in", unauth.status === 401, `status ${unauth.status}`);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Log in")');
  await page.waitForURL(`${base}/doctor`);
  check("the clinician logs in", true);

  // Starting state, then a sample request saved through saveRequest.
  await api("/api/demo/reset", "POST");
  await page.goto(`${base}/doctor`);
  await shoot("02-inbox-empty");
  check("the empty inbox says nothing is waiting", await page.getByText("No check-up requests are waiting").isVisible());
  check("placeholder patients read as placeholders", (await page.getByText("Placeholder", { exact: true }).count()) >= 3);

  const saved = await api("/api/demo/request", "POST");
  check("a sample request is saved", saved.ok());

  // A check-in in which the patient scored one measure herself, made through her own screens.
  const patientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const patientPage = await patientContext.newPage();
  patientPage.setDefaultTimeout(60_000);
  await patientPage.goto(`${base}/patient/login`);
  await patientPage.fill('input[name="password"]', process.env.PATIENT_PASSWORD ?? env.PATIENT_PASSWORD);
  await patientPage.click("button");
  await patientPage.waitForURL(`${base}/patient`);
  await patientPage.goto(`${base}/patient/checkin`);
  await patientPage.getByLabel("Your notes for today").fill("The liner itched in the afternoon and the socket felt tight when I walked.");
  await patientPage.locator("button[data-measure=comfort][data-step='2']").click();
  await patientPage.getByRole("button", { name: "Save my check-in" }).click();
  await patientPage.getByRole("heading", { name: "Saved. Here is what I recorded" }).waitFor();
  await patientContext.close();

  // The record marks the figure she picked herself, in the day and in the list of entries.
  await page.goto(`${base}/doctor/patients/maria`);
  await page.waitForSelector("text=Summary of the record");
  const noted = await page.locator("[data-own-note]").first().textContent();
  check("the record's entry list says how many figures she picked", /1 of 3 picked by the patient/.test(noted ?? ""), noted ?? "");
  await page.locator("[data-own-note]").first().locator("xpath=ancestor::li").locator("[data-day]").click();
  const ownDay = page.getByRole("dialog");
  await ownDay.waitFor();
  const marked = ownDay.locator("[data-own=comfort]");
  check("the day marks the patient-picked figure: comfort", await marked.isVisible() && /picked by the patient/.test((await marked.textContent()) ?? ""));
  check("and not the figures read from her words", (await ownDay.locator("[data-own]").count()) === 1);
  await shoot("04b-own-score-marked");
  if (shots) await page.screenshot({ path: path.join(shots, "04c-own-score-marked-1280.png") });
  await page.keyboard.press("Escape");

  // The inbox.
  await page.goto(`${base}/doctor`);
  const top = page.locator('[data-testid="waiting"] li').first();
  const headline = (await top.textContent()) ?? "";
  check("the request is at the top of the inbox with its reason", headline.includes("Comfort and mobility have fallen") && headline.includes("New"), headline.slice(0, 80));
  const reason = (await page.locator("section[aria-labelledby=patients]").textContent()) ?? "";
  check("Maria's row says why she matters", reason.includes("Combined figure") && reason.includes("lower since"));
  await shoot("03-inbox");

  // Opening it marks it seen.
  await top.locator("a").click();
  await page.waitForURL(/requests\/sample-request/);
  let status = "";
  for (let i = 0; i < 20 && status !== "seen"; i++) {
    status = (await (await api("/api/demo/request?id=sample-request")).json()).status;
    if (status !== "seen") await sleep(250);
  }
  check("opening the request marks it seen", status === "seen", `status ${status}`);
  await page.waitForSelector("text=What has changed");
  check("the case shows the patient's own words", await page.getByTestId("request-body").isVisible());
  await shoot("04-request-case");

  // An evidence day.
  await page.locator('[data-day]').filter({ hasText: /\d{4}/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const dayText = (await dialog.textContent()) ?? "";
  check("an evidence day opens with the patient's words and figures", dayText.includes("In the patient") && dayText.includes("Comfort"), dayText.slice(0, 60));
  await shoot("05-day-panel");
  await page.keyboard.press("Escape");

  // Answer with an offered time.
  await page.getByRole("button", { name: "Send the time" }).click();
  await page.getByTestId("reply").waitFor();
  const got = await (await api("/api/demo/request?id=sample-request")).json();
  check("an offered time is sent: status answered", got.status === "answered", got.status);
  check("the reply is readable through getRequest", got.reply?.kind === "offer_time" && Boolean(got.reply?.proposedTime), JSON.stringify(got.reply));
  await shoot("06-answered");

  // The record, and a placeholder.
  await page.goto(`${base}/doctor/patients/maria`);
  await page.waitForSelector("text=Summary of the record");
  check("the record shows the summary and says who wrote it", (await page.locator("[data-summary-by]").count()) === 1);
  check("the record draws a graph per measure and the combined", (await page.locator("svg[role=img]").count()) === 4);
  await shoot("07-record");
  await page.goto(`${base}/doctor/patients/case-4471`);
  await shoot("08-placeholder");

  // Reset.
  await page.goto(`${base}/doctor`);
  await page.getByText("Demo tools").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Reset to the starting state/ }).click();
  await page.getByText(/Reset done/).waitFor();
  const after = await api("/api/demo/request?id=sample-request");
  check("the reset removes the request", after.status() === 404, `status ${after.status()}`);
  if (!process.env.BASE_URL) {
    const files = (dir) =>
      !existsSync(dir) ? [] : readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [n]));
    check("the reset leaves no stored files for Maria", files(path.join(root, ".data/patients/maria")).length === 0);
  }
  await page.goto(`${base}/doctor`);
  check("the inbox is empty again", await page.getByText("No check-up requests are waiting").isVisible());
} catch (error) {
  check("the run completed", false, String(error).split("\n")[0]);
  await shoot("failure").catch(() => {});
} finally {
  await browser.close();
  server?.kill();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
