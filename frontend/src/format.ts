/** All display conversion from MW. Values arrive in MW; GW is for display only (Art. III). */

const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sign(n: number): string {
  return n < 0 ? MINUS : "";
}

/** 11600 → "11.6 GW" */
export function gw(mw: number): string {
  const v = Math.abs(mw / 1000).toFixed(1);
  return `${v === "0.0" ? "" : sign(mw)}${v} GW`;
}

/** 1700 → "+1.7 GW", −300 → "−0.3 GW" */
export function signedGw(mw: number): string {
  const v = Math.abs(mw / 1000).toFixed(1);
  if (v === "0.0") return "0.0 GW";
  return `${mw < 0 ? MINUS : "+"}${v} GW`;
}

/** Sum of hourly MW × 1 h → "278,400 MWh". Null forecasts are skipped. */
export function dayMwh(points: { forecast: number | null }[]): string {
  const total = points.reduce((sum, p) => sum + (p.forecast ?? 0), 0);
  return `${Math.round(total).toLocaleString("en-GB")} MWh`;
}

/** "2026-01-14T07:30:00Z" → "07:30" (UTC) */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "2026-01-14" or an ISO time → "14 Jan" (UTC) */
export function dayLabel(isoOrDate: string): string {
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-01-14T07:30:00Z" → "14 Jan 07:30" (UTC) */
export function runLabel(iso: string): string {
  return `${dayLabel(iso)} ${hhmm(iso)}`;
}

/** 90 → "1 h 30 min", 30 → "30 min" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "2026-01-15" → "2026-01-14" */
export function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
