/** Pure R6 signal and R7 watch list wording (spec FR-010, FR-011; research D9). No React. */

import type { Decision } from "./api";
import { gw, hhmm, runLabel, signedGw } from "./format";

export const SIGNAL_THRESHOLD_MW = 500;
export const RAMP_THRESHOLD_MW = 500;

export interface Signal {
  level: "high" | "low" | "close";
  title: string;
  text: string;
  verdict?: string;
}

export interface WatchItem {
  kind: "widest" | "leastWind" | "ramp" | "change";
  text: string;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function forecasts(d: Decision): number[] {
  return d.points.map((p) => p.forecast).filter((f): f is number => f !== null);
}

/** R6: compare the recent bias at this decision time with ±500 MW. */
export function signal(d: Decision, options: { showActuals?: boolean } = {}): Signal | null {
  const bias = d.history?.bias ?? null;
  const raw = mean(forecasts(d));
  if (bias === null || raw === null || !d.history) return null;
  const adjusted = raw - bias;
  const days = d.history.days;
  const figures =
    `Adjusted for that, expect about ${gw(adjusted)} on average, ` +
    `against the raw forecast of ${gw(raw)}.`;

  let s: Signal;
  if (bias > SIGNAL_THRESHOLD_MW) {
    s = {
      level: "high",
      title: "Forecast likely too high",
      text:
        `Over the last ${days} days at this decision time the forecast was ${gw(bias)} ` +
        `above actual wind on average. ${figures}`,
    };
  } else if (bias < -SIGNAL_THRESHOLD_MW) {
    s = {
      level: "low",
      title: "Forecast likely too low",
      text:
        `Over the last ${days} days at this decision time the forecast was ${gw(-bias)} ` +
        `below actual wind on average. ${figures}`,
    };
  } else {
    s = {
      level: "close",
      title: "Forecast has been close to target",
      text:
        `Over the last ${days} days at this decision time the forecast was within ` +
        `${gw(SIGNAL_THRESHOLD_MW)} of actual wind on average (${signedGw(bias)}). ${figures}`,
    };
  }

  if (options.showActuals) {
    const actualMean = mean(
      d.points.filter((p) => p.forecast !== null && p.actual !== null).map((p) => p.actual!),
    );
    if (actualMean !== null) {
      const adjustedCloser = Math.abs(adjusted - actualMean) < Math.abs(raw - actualMean);
      s.verdict =
        `Actual wind averaged ${gw(actualMean)}: ` +
        (adjustedCloser
          ? "the adjusted figure was closer than the raw forecast."
          : "the raw forecast was closer than the adjusted figure.");
    }
  }
  return s;
}

/** R7: widest range, least wind, steepest ramp (≥ 500 MW), change vs the run 24 h earlier. */
export function watchList(d: Decision): WatchItem[] {
  const items: WatchItem[] = [];
  const pts = d.points;

  const banded = pts.filter((p) => p.low !== null && p.high !== null);
  if (banded.length) {
    const w = banded.reduce((a, b) => (b.high! - b.low! > a.high! - a.low! ? b : a));
    items.push({
      kind: "widest",
      text: `Widest likely range at ${hhmm(w.time)}: ${gw(w.low!)} to ${gw(w.high!)}.`,
    });
  }

  const withForecast = pts.filter((p) => p.forecast !== null);
  if (withForecast.length) {
    const m = withForecast.reduce((a, b) => (b.forecast! < a.forecast! ? b : a));
    items.push({ kind: "leastWind", text: `Least wind at ${hhmm(m.time)}: ${gw(m.forecast!)}.` });
  }

  let ramp: { from: string; to: string; delta: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].forecast;
    const b = pts[i].forecast;
    if (a === null || b === null) continue;
    if (ramp === null || Math.abs(b - a) > Math.abs(ramp.delta)) {
      ramp = { from: hhmm(pts[i - 1].time), to: hhmm(pts[i].time), delta: b - a };
    }
  }
  if (ramp && Math.abs(ramp.delta) >= RAMP_THRESHOLD_MW) {
    items.push({
      kind: "ramp",
      text: `Steepest change from ${ramp.from} to ${ramp.to}: ${signedGw(ramp.delta)}.`,
    });
  }

  const c = d.changeVs24h;
  if (c && c.otherRun) {
    const against =
      c.basis === "24h"
        ? `the run 24 h earlier (${runLabel(c.otherRun)})`
        : `the previous run (${runLabel(c.otherRun)}), as no run was published 24 h earlier`;
    let text: string;
    if (c.identical) {
      text = `No change against ${against}.`;
    } else {
      const move = c.biggestMove
        ? `; biggest single-hour move ${signedGw(c.biggestMove.delta)} at ${hhmm(c.biggestMove.time)}`
        : "";
      text = `Change against ${against}: ${signedGw(c.meanChange)} on average${move}.`;
    }
    items.push({ kind: "change", text });
  }
  return items;
}
