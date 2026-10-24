import { describe, expect, it } from "vitest";
import type { Decision } from "../api";
import { RAMP_THRESHOLD_MW, SIGNAL_THRESHOLD_MW, signal, watchList } from "../insights";
import { decision } from "./fixtures";

const withBias = (bias: number): Decision => ({
  ...decision,
  history: { days: 30, bias, mae: 2000 },
});

/** Flat forecast at 10 GW with one step of `step` MW at 12:00, and a fixed band. */
function stepDecision(step: number): Decision {
  return {
    ...decision,
    points: decision.points.map((p, h) => {
      const f = h >= 12 ? 10000 + step : 10000;
      return { ...p, forecast: f, low: f - 1000, high: f + 1000 };
    }),
  };
}

describe("R6 signal (FR-010)", () => {
  it("uses ±500 MW thresholds", () => {
    expect(SIGNAL_THRESHOLD_MW).toBe(500);
    expect(signal(withBias(501))).toMatchObject({ level: "high", title: "Forecast likely too high" });
    expect(signal(withBias(500))).toMatchObject({
      level: "close",
      title: "Forecast has been close to target",
    });
    expect(signal(withBias(-500))).toMatchObject({ level: "close" });
    expect(signal(withBias(-501))).toMatchObject({ level: "low", title: "Forecast likely too low" });
  });

  it("states the bias, the adjusted figure and the raw forecast mean", () => {
    const s = signal(withBias(1800))!;
    // raw mean 11,666.7 MW; adjusted = 11,666.7 − 1,800 = 9,866.7 MW
    expect(s.text).toContain("1.8 GW");
    expect(s.text).toContain("9.9 GW");
    expect(s.text).toContain("11.7 GW");
  });

  it("is null without history or forecast", () => {
    expect(signal({ ...decision, history: { days: 0, bias: null, mae: null } })).toBeNull();
    expect(signal({ ...decision, points: [] })).toBeNull();
  });
});

describe("R7 watch list (FR-011)", () => {
  it("lists widest, least wind, ramp and change, in that order", () => {
    const items = watchList(decision);
    expect(items.map((i) => i.kind)).toEqual(["widest", "leastWind", "ramp", "change"]);
    expect(items[0].text).toContain("17:00");
    expect(items[1].text).toContain("16:00");
    expect(items[1].text).toContain("8.0 GW");
    expect(items[3].text).toContain("−0.3 GW");
    expect(items[3].text).toContain("13 Jan 07:30");
  });

  it("omits the ramp below 500 MW and shows it at 500 MW", () => {
    expect(RAMP_THRESHOLD_MW).toBe(500);
    expect(watchList(stepDecision(499)).map((i) => i.kind)).not.toContain("ramp");
    const ramp = watchList(stepDecision(500)).find((i) => i.kind === "ramp");
    expect(ramp?.text).toContain("11:00");
    expect(ramp?.text).toContain("12:00");
    expect(ramp?.text).toContain("+0.5 GW");
  });

  it('says "No change" when the runs are identical', () => {
    const d: Decision = { ...decision, changeVs24h: { ...decision.changeVs24h!, identical: true } };
    expect(watchList(d).find((i) => i.kind === "change")?.text).toContain("No change");
  });

  it("names the fallback when there is no run 24 h earlier", () => {
    const d: Decision = { ...decision, changeVs24h: decision.changeVsPrevious };
    const text = watchList(d).find((i) => i.kind === "change")!.text;
    expect(text).toContain("previous run");
    expect(text).toContain("no run was published 24 h earlier");
  });

  it("skips items whose inputs are missing", () => {
    const d: Decision = {
      ...decision,
      changeVs24h: null,
      points: decision.points.map((p) => ({ ...p, low: null, high: null })),
    };
    expect(watchList(d).map((i) => i.kind)).toEqual(["leastWind", "ramp"]);
    expect(watchList({ ...decision, points: [], changeVs24h: null })).toEqual([]);
  });
});

describe("R6 verdict with actuals (US3)", () => {
  it("says the adjusted figure was closer when it was", () => {
    // raw 11,666.7; adjusted 9,866.7; actual mean 10,166.7 → adjusted is 300 away, raw 1,500
    const s = signal(withBias(1800), { showActuals: true })!;
    expect(s.verdict).toContain("the adjusted figure was closer");
    expect(s.verdict).toContain("10.2 GW");
  });

  it("says the raw forecast was closer otherwise", () => {
    // adjusted 12,666.7 is 2,500 away; raw is 1,500 away
    const s = signal(withBias(-1000), { showActuals: true })!;
    expect(s.verdict).toContain("the raw forecast was closer");
  });

  it("has no verdict when actuals are hidden", () => {
    expect(signal(withBias(1800))!.verdict).toBeUndefined();
    expect(signal(withBias(1800), { showActuals: false })!.verdict).toBeUndefined();
  });
});
