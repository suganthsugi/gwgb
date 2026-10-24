/** Response types mirror contracts/api.md exactly. All power values are MW. */

export interface HourlyPoint {
  time: string;
  forecast: number | null;
  publishTime: string | null;
  horizonH: number | null;
  low: number | null;
  high: number | null;
  actual: number | null;
  error: number | null;
}

export interface Metrics {
  n: number;
  mae: number;
  bias: number;
  rmse: number;
  p90AbsError: number;
  nmaePct: number | null;
  meanActual: number;
  meanForecast: number;
}

export interface RunComparison {
  basis: "24h" | "previous";
  otherRun: string | null;
  hours: number;
  meanChange: number;
  biggestMove: { time: string; delta: number } | null;
  identical: boolean;
}

export interface DriftEntry {
  publishTime: string;
  meanForecast: number;
}

export interface Decision {
  deliveryDate: string;
  cutoff: string;
  cutoffAt: string;
  usedRun: string | null;
  minutesBeforeCutoff: number | null;
  band: { q10Error: number; q90Error: number } | null;
  history: { days: number; bias: number | null; mae: number | null } | null;
  drift: DriftEntry[];
  driftHours: { from: string; to: string; count: number } | null;
  changeVsPrevious: RunComparison | null;
  changeVs24h: RunComparison | null;
  metrics: Metrics | null;
  points: HourlyPoint[];
}

export interface ByHour {
  hour: number;
  bias: number;
  mae: number;
  n: number;
}

export interface DailyEntry {
  date: string;
  mae: number;
  bias: number;
  meanActual: number;
  n: number;
}

export interface HistogramBin {
  fromMw: number | null;
  toMw: number | null;
  label: string;
  count: number;
}

export interface MetricsReport {
  metrics: Metrics;
  byHour: ByHour[];
  daily: DailyEntry[];
  worstDays: DailyEntry[];
  histogram: HistogramBin[];
}

export interface HorizonBucket {
  bucket: string;
  fromH: number;
  mae: number | null;
  bias: number | null;
  n: number;
}

export class ApiError extends Error {
  detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = "ApiError";
    this.detail = detail;
  }
}

export async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : String(err));
  }
  if (!response.ok) {
    let detail = `The server answered ${response.status}.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the status sentence
    }
    throw new ApiError(detail);
  }
  return (await response.json()) as T;
}

export function fetchDecision(date: string, cutoff: string): Promise<Decision> {
  const q = new URLSearchParams({ delivery_date: date, cutoff });
  return getJson<Decision>(`/api/decision?${q.toString()}`);
}

export function fetchMetrics(): Promise<MetricsReport> {
  return getJson<MetricsReport>("/api/metrics");
}

export function fetchByHorizon(): Promise<HorizonBucket[]> {
  return getJson<HorizonBucket[]>("/api/metrics/by-horizon");
}
