// Small wording and date helpers for the clinician's screens. Dates are
// YYYY-MM-DD in Swedish time, as everywhere else in the app.

const TZ = "Europe/Stockholm";

export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "3 hours ago", "yesterday", "5 days ago": the age of a moment, for lists. */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export const fmtScore = (v: number | null) => (v === null ? "-" : v.toFixed(1));

/** The Swedish calendar date and clock time of an instant, as a datetime-local value. */
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** A datetime-local value read as Swedish time, back to an ISO instant. */
export function fromLocalInput(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment: compare what Stockholm shows for the
  // guess with the guess itself, and move by the difference.
  const shown = toLocalInput(new Date(asUtc).toISOString());
  const sm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(shown);
  if (!sm) return null;
  const [, sy, smo, sd, sh, smi] = sm.map(Number);
  const offset = Date.UTC(sy, smo - 1, sd, sh, smi) - asUtc;
  const date = new Date(asUtc - offset);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
