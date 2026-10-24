import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, vi } from "vitest";

/** Props of every stubbed chart rendered in the current test, newest last. */
export interface ChartProps {
  type?: string;
  series: { name?: string; data?: unknown[] }[];
  options?: {
    chart?: { events?: Record<string, (...args: unknown[]) => void> };
    [key: string]: unknown;
  };
}
export const charts: ChartProps[] = [];

vi.mock("react-apexcharts", () => ({
  default: (props: ChartProps) => {
    charts.push(props);
    return createElement(
      "div",
      { "data-testid": "chart", "data-type": props.type },
      (props.series ?? []).map((s, i) => createElement("span", { key: i }, s.name ?? "")),
    );
  },
}));

/** Latest render of a chart that has a series with this name. */
export function chartWithSeries(name: string): ChartProps | undefined {
  return [...charts].reverse().find((c) => c.series?.some((s) => s.name === name));
}

type Reply = { status?: number; body: unknown } | Error;
export type Routes = Record<string, Reply | ((url: string) => Reply)>;

/** Replace global fetch. Keys match by substring, longest first; unmatched URLs return 404. */
export function mockFetch(routes: Routes) {
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = keys.find((k) => url.includes(k));
    const entry = key === undefined ? { status: 404, body: { detail: "Not found." } } : routes[key];
    const reply = typeof entry === "function" ? entry(url) : entry;
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    return new Response(JSON.stringify(reply.body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  charts.length = 0;
  vi.unstubAllGlobals();
});

/** Latest render of the chart with this `options.chart.id`. */
export function chartById(id: string): ChartProps | undefined {
  return [...charts].reverse().find((c) => (c.options?.chart as { id?: string })?.id === id);
}
