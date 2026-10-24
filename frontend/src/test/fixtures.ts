import type { Decision, HorizonBucket, HourlyPoint, MetricsReport } from "../api";

const iso = (day: string, h: number) => `${day}T${String(h).padStart(2, "0")}:00:00Z`;

/** Forecast for 15 Jan: 12 GW flat, dipping to 8 GW at 16:00 (mean ≈ 11.7 GW). */
const FORECAST = Array.from({ length: 24 }, (_, h) =>
  h === 16 ? 8000 : h === 15 || h === 17 ? 10000 : 12000,
);

function points(withActuals: boolean): HourlyPoint[] {
  return FORECAST.map((f, h) => ({
    time: iso("2026-01-15", h),
    forecast: f,
    publishTime: "2026-01-14T07:30:00Z",
    horizonH: 16.5 + h,
    low: f - (h === 17 ? 5000 : 4300),
    high: f + 1200,
    actual: withActuals ? f - 1500 : null,
    error: withActuals ? 1500 : null,
  }));
}

export const decision: Decision = {
  deliveryDate: "2026-01-15",
  cutoff: "09:00",
  cutoffAt: "2026-01-14T09:00:00Z",
  usedRun: "2026-01-14T07:30:00Z",
  minutesBeforeCutoff: 90,
  band: { q10Error: -1200, q90Error: 4300 },
  history: { days: 30, bias: 1800, mae: 2100 },
  drift: [
    "2026-01-13T02:30:00Z",
    "2026-01-13T04:30:00Z",
    "2026-01-13T07:30:00Z",
    "2026-01-13T09:30:00Z",
    "2026-01-13T11:30:00Z",
    "2026-01-13T22:30:00Z",
    "2026-01-14T02:30:00Z",
    "2026-01-14T07:30:00Z",
  ].map((publishTime, i) => ({ publishTime, meanForecast: 11500 + 20 * i })),
  driftHours: { from: "00:00", to: "21:00", count: 22 },
  changeVsPrevious: {
    basis: "previous",
    otherRun: "2026-01-14T04:30:00Z",
    hours: 24,
    meanChange: 0,
    biggestMove: { time: iso("2026-01-15", 0), delta: 0 },
    identical: true,
  },
  changeVs24h: {
    basis: "24h",
    otherRun: "2026-01-13T07:30:00Z",
    hours: 24,
    meanChange: -300,
    biggestMove: { time: iso("2026-01-15", 18), delta: -900 },
    identical: false,
  },
  metrics: {
    n: 24,
    mae: 1500,
    bias: 1500,
    rmse: 1500,
    p90AbsError: 1500,
    nmaePct: 14.7,
    meanActual: 10166.7,
    meanForecast: 11666.7,
  },
  points: points(true),
};

export const decisionNoActuals: Decision = { ...decision, metrics: null, points: points(false) };

export const decisionAt1200: Decision = {
  ...decision,
  cutoff: "12:00",
  cutoffAt: "2026-01-14T12:00:00Z",
  usedRun: "2026-01-14T11:30:00Z",
  minutesBeforeCutoff: 30,
};

export const decisionNoRun: Decision = {
  ...decision,
  cutoff: "00:00",
  cutoffAt: "2026-01-14T00:00:00Z",
  usedRun: null,
  minutesBeforeCutoff: null,
  drift: [],
  driftHours: null,
  changeVsPrevious: null,
  changeVs24h: null,
  metrics: null,
  points: [],
};

/** Hours 22:00 and 23:00 not covered by any run (research D3). */
export const decisionPartial: Decision = {
  ...decision,
  points: points(true).map((p, h) =>
    h >= 22 ? { ...p, forecast: null, publishTime: null, horizonH: null, low: null, high: null, error: null } : p,
  ),
};

const DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 2 + i));
  return d.toISOString().slice(0, 10);
});

const daily = DAYS.map((date, i) => ({
  date,
  mae: date === "2026-01-28" ? 5200 : 1000 + 37 * i,
  bias: 900 + 20 * i,
  meanActual: 9000 + 50 * i,
  n: 24,
}));

const HIST_COUNTS = [2, 5, 9, 14, 20, 31, 52, 80, 110, 120, 100, 80, 52, 35, 20, 14];

export const metricsReport: MetricsReport = {
  metrics: {
    n: 744,
    mae: 2023,
    bias: 1746,
    rmse: 2497,
    p90AbsError: 4154,
    nmaePct: 21.3,
    meanActual: 9500,
    meanForecast: 11246,
  },
  byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, bias: 1500 + 10 * hour, mae: 2000, n: 31 })),
  daily,
  worstDays: [...daily].sort((a, b) => b.mae - a.mae).slice(0, 10),
  histogram: HIST_COUNTS.map((count, i) => {
    const from = -8000 + 1000 * i;
    if (i === 0) return { fromMw: null, toMw: -7000, label: "< −7 GW", count };
    if (i === 15) return { fromMw: 7000, toMw: null, label: "≥ +7 GW", count };
    return { fromMw: from, toMw: from + 1000, label: `${from / 1000} to ${(from + 1000) / 1000} GW`, count };
  }),
};

export const byHorizon: HorizonBucket[] = Array.from({ length: 12 }, (_, i) => ({
  bucket: `${6 * i}–${6 * i + 6} h`,
  fromH: 6 * i,
  mae: 1200 + 150 * i,
  bias: 800 + 60 * i,
  n: 400,
}));
