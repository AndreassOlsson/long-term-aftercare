import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { allChanges, describeChange } from "@/components/clinician/case";
import { fmtScore, longDate, shortDate } from "@/components/clinician/format";
import { addDays } from "./dates";
import { getEntries } from "./entries";
import { getPatient } from "./patients";
import { getRequest } from "./requests";
import { getObject } from "./storage";

// The check-up request as a document someone would hand over: what changed and
// since when, the figures, her words, the pictures, the date and her name.
// Built from the same record the clinician reads, as of the day it was sent.

const W = 595;
const H = 842;
const M = 52;
const COLUMN = W - 2 * M;
const INK = rgb(0.09, 0.13, 0.17);
const MUTED = rgb(0.36, 0.41, 0.46);
const LINE = rgb(0.87, 0.89, 0.91);
const ACCENT = rgb(0.06, 0.43, 0.42);

export async function buildRequestPdf(patientId: string, requestId: string, origin: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const patient = getPatient(patientId);
  if (!patient || patient.placeholder) return null;
  const request = await getRequest(patient.id, requestId);
  if (!request) return null;
  const entries = await getEntries(patient.id);

  const doc = await PDFDocument.create();
  doc.setTitle(`Check-up request: ${request.headline}`);
  doc.setAuthor(patient.name);
  doc.setSubject("Check-up request");
  doc.setCreator("Long-term aftercare");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  /** Text the standard font can draw: anything outside its character set becomes a plain stand-in. */
  const safe = (text: string, font: PDFFont) => {
    const set = new Set(font.getCharacterSet());
    return [...text.replace(/\r/g, "").replace(/[‑‐]/g, "-").replace(/ /g, " ")].map((ch) => (ch === "\n" || set.has(ch.codePointAt(0) as number) ? ch : "?")).join("");
  };

  const pages: PDFPage[] = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - M;
  const ensure = (need: number) => {
    if (y - need < M + 24) {
      page = doc.addPage([W, H]);
      pages.push(page);
      y = H - M;
    }
  };

  function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of safe(text, font).split("\n")) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function paragraph(text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    const lead = size * 1.45;
    for (const line of wrap(text, font, size, COLUMN - indent)) {
      ensure(lead);
      y -= lead;
      if (line) page.drawText(line, { x: M + indent, y, size, font, color: opts.color ?? INK });
    }
    y -= opts.gap ?? 4;
  }

  function heading(text: string) {
    ensure(40);
    y -= 14;
    page.drawText(safe(text, bold), { x: M, y: y - 12, size: 12.5, font: bold, color: ACCENT });
    y -= 16;
    page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.6, color: LINE });
    y -= 8;
  }

  // ---- the head: what it is, whose, when
  const sent = new Date(request.createdAt);
  const sentOn = sent.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const sentLong = sent.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" });
  page.drawText("CHECK-UP REQUEST", { x: M, y: y - 10, size: 9.5, font: bold, color: ACCENT });
  y -= 22;
  page.drawText(safe(patient.name, bold), { x: M, y: y - 14, size: 15, font: bold, color: INK });
  y -= 22;
  page.drawText(safe(`Sent ${sentLong} through the patient's aftercare record. Written or accepted by the patient.`, regular), { x: M, y: y - 9, size: 9.5, font: regular, color: MUTED });
  y -= 18;
  paragraph(request.headline, { font: bold, size: 17, gap: 6 });

  // ---- what changed, as of the day it was sent
  const upTo = entries.filter((e) => e.date <= sentOn).slice(-1)[0]?.date;
  const changes = allChanges(entries, upTo);
  const combined = changes[0];
  heading("What has changed");
  const moved = changes.filter((c) => c.key !== "combined" && c.since);
  for (const c of moved.length ? moved : [combined]) paragraph(`- ${describeChange(c)}`, { indent: 4, gap: 2 });
  if (combined.since) paragraph(`The combined figure has been lower than usual since ${longDate(combined.since)}.`, { gap: 6 });

  // The figures: usual, now, change, lowest recently.
  const cols = [0, 150, 210, 270, 335];
  ensure(24 + changes.length * 18);
  y -= 6;
  const head = ["Measure", "Usual", "Now", "Change", "Lowest recently"];
  head.forEach((t, i) => page.drawText(t, { x: M + cols[i], y: y - 9, size: 9, font: bold, color: MUTED }));
  y -= 14;
  for (const c of changes) {
    y -= 15;
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.4, color: LINE });
    const cells = [
      c.label,
      fmtScore(c.baseline),
      fmtScore(c.now),
      c.delta === null ? "-" : `${c.delta > 0 ? "+" : ""}${c.delta.toFixed(1)}`,
      c.lowest ? `${fmtScore(c.lowest.value)} on ${shortDate(c.lowest.date)}` : "-",
    ];
    cells.forEach((t, i) => page.drawText(safe(t, c.key === "combined" && i === 0 ? bold : regular), { x: M + cols[i], y, size: 10, font: c.key === "combined" && i === 0 ? bold : regular, color: INK }));
  }
  y -= 4;
  paragraph("Figures from her record, 1 to 5 with 5 the good end. \"Now\" is the mean of her latest three days.", { size: 8.5, color: MUTED });

  // ---- the figures over time: the combined figure over the last three months
  heading("The figures over time");
  const chartH = 110;
  ensure(chartH + 40);
  const end = upTo ?? sentOn;
  const start = addDays(end, -90);
  const pts = entries.filter((e) => e.combined !== null && e.date >= start && e.date <= end);
  const top = y - 6;
  const left = M + 28;
  const right = W - M - 4;
  const dn = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
  const cx = (d: string) => left + ((dn(d) - dn(start)) / 90) * (right - left);
  const cy = (v: number) => top - chartH + ((v - 1) / 4) * chartH;
  for (const v of [1, 2, 3, 4, 5]) {
    page.drawLine({ start: { x: left, y: cy(v) }, end: { x: right, y: cy(v) }, thickness: 0.4, color: LINE });
    page.drawText(String(v), { x: M + 14, y: cy(v) - 3, size: 8, font: regular, color: MUTED });
  }
  page.drawText("worse", { x: M, y: cy(1) - 12, size: 7.5, font: regular, color: MUTED });
  page.drawText("better", { x: M, y: cy(5) + 6, size: 7.5, font: regular, color: MUTED });
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({ start: { x: cx(pts[i - 1].date), y: cy(pts[i - 1].combined as number) }, end: { x: cx(pts[i].date), y: cy(pts[i].combined as number) }, thickness: 1.8, color: ACCENT });
  }
  for (const p of pts.slice(-1)) page.drawCircle({ x: cx(p.date), y: cy(p.combined as number), size: 3.2, color: ACCENT });
  for (const d of [start, addDays(start, 30), addDays(start, 60), end]) {
    page.drawText(shortDate(d), { x: Math.min(cx(d), right - 28), y: top - chartH - 14, size: 8, font: regular, color: MUTED });
  }
  y = top - chartH - 24;
  paragraph("The combined figure over the three months before the request, as she reported it.", { size: 8.5, color: MUTED });

  // ---- her words
  heading("In her words");
  paragraph(request.body, { gap: 8 });
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const dates = [...request.evidenceDates].sort();
  const dated = dates.map((d) => byDate.get(d)).filter((e) => e && e.text.trim());
  if (dates.length) {
    paragraph(`The days it rests on: ${dates.map(shortDate).join(", ")}.`, { font: bold, size: 10, gap: 4 });
    for (const e of dated) paragraph(`${longDate(e!.date)}: ${e!.text.trim()}`, { indent: 6, size: 10, gap: 3 });
  }

  // ---- pictures
  const keys = request.images.slice(0, 3);
  if (keys.length) {
    heading("Pictures");
    const loaded: { img: Awaited<ReturnType<PDFDocument["embedJpg"]>>; caption: string }[] = [];
    for (const key of keys) {
      try {
        const seed = key.match(/\/images\/seed-(healthy|medium|unhealthy)(-\d+)?\.jpg$/);
        const bytes = seed ? new Uint8Array(await (await fetch(`${origin}/photos/${seed[1]}.jpg`)).arrayBuffer()) : (await getObject(key))?.body;
        if (!bytes) continue;
        const asBytes = new Uint8Array(bytes);
        const png = asBytes[0] === 0x89 && asBytes[1] === 0x50;
        const img = png ? await doc.embedPng(asBytes) : await doc.embedJpg(asBytes);
        const day = entries.find((e) => e.images.includes(key))?.date;
        loaded.push({ img, caption: day ? longDate(day) : "Attached to the request" });
      } catch {
        // A picture that cannot be read is left out; the document is still whole.
      }
    }
    if (loaded.length) {
      const cell = (COLUMN - 20) / 3;
      const maxH = 200;
      ensure(maxH + 30);
      loaded.forEach(({ img, caption }, i) => {
        const scale = Math.min(cell / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = M + i * (cell + 10);
        page.drawImage(img, { x, y: y - h - 4, width: w, height: h });
        page.drawText(safe(caption, regular), { x, y: y - maxH - 16, size: 8.5, font: regular, color: MUTED });
      });
      y -= maxH + 24;
    }
  }

  // ---- the foot of every page: her name, the date, the page
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINE });
    p.drawText(safe(`${patient.name}  |  Check-up request sent ${sentLong}`, regular), { x: M, y: M - 20, size: 8.5, font: regular, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8.5), y: M - 20, size: 8.5, font: regular, color: MUTED });
  });

  // Plain objects, no object streams: the simplest file for any reader, and the one a check can read.
  const bytes = await doc.save({ useObjectStreams: false });
  const slug = patient.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return { bytes, name: `check-up-request-${slug}-${sentOn}.pdf` };
}
