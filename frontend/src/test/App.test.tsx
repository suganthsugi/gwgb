import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { byHorizon, decision, metricsReport } from "./fixtures";
import { chartById, mockFetch } from "./setup";

describe("App shell (FR-026)", () => {
  beforeEach(() => {
    mockFetch({
      "/api/decision": { body: decision },
      "/api/metrics/by-horizon": { body: byHorizon },
      "/api/metrics": { body: metricsReport },
    });
  });

  it("shows the title and subtitle", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "REint Weather Forecast" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Day-ahead wind outlook and forecast reliability · GB national wind · Pilot: January 2026",
      ),
    ).toBeInTheDocument();
  });

  it("has two tabs with the outlook selected by default", () => {
    render(<App />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Day-ahead outlook", "Forecast accuracy"]);
    expect(screen.getByRole("tab", { name: "Day-ahead outlook" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("names the data source and the time zone in the footer", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Elexon");
    expect(footer).toHaveTextContent("times in UTC (= UK time in January)");
  });
});

describe("Drill-down from accuracy to outlook (AC11)", () => {
  async function openAccuracy() {
    const fetch = mockFetch({
      "/api/decision": { body: decision },
      "/api/metrics/by-horizon": { body: byHorizon },
      "/api/metrics": { body: metricsReport },
    });
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: "Forecast accuracy" }));
    await screen.findByRole("table", { name: "Worst days" });
    return fetch;
  }

  async function expectOutlookFor28Jan(fetch: ReturnType<typeof mockFetch>) {
    expect(screen.getByRole("tab", { name: "Day-ahead outlook" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Wind forecast for 28 Jan as it stood at 09:00 on 27 Jan/)).toBeInTheDocument();
    expect(screen.getByLabelText("Show actual outturn")).toBeChecked();
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).includes("delivery_date=2026-01-28"))).toBe(
        true,
      ),
    );
  }

  it('opens the day from the worst-days table "Open day →"', async () => {
    const fetch = await openAccuracy();
    await userEvent.click(screen.getByRole("button", { name: "Open day → 28 Jan" }));
    await expectOutlookFor28Jan(fetch);
  });

  it("opens the day from a click on the bias-by-day chart", async () => {
    const fetch = await openAccuracy();
    const chart = chartById("bias-day")!;
    const index = metricsReport.daily.findIndex((d) => d.date === "2026-01-28");
    act(() => chart.options!.chart!.events!.dataPointSelection(null, null, { dataPointIndex: index }));
    await expectOutlookFor28Jan(fetch);
  });
});

describe("Data service down (AC12, SC-005)", () => {
  it("keeps the shell and shows an error in every data area on both tabs", async () => {
    mockFetch({ "/api/": new TypeError("Failed to fetch") });
    render(<App />);
    expect(screen.getByRole("heading", { name: "REint Weather Forecast" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    // outlook: run in use, signal + watch list, KPIs, chart, drift, table
    expect(await screen.findAllByText("Couldn't load data: Failed to fetch")).toHaveLength(6);

    await userEvent.click(screen.getByRole("tab", { name: "Forecast accuracy" }));
    // accuracy: KPIs, four charts, worst days
    await waitFor(() =>
      expect(screen.getAllByText("Couldn't load data: Failed to fetch")).toHaveLength(6),
    );
    expect(screen.getByRole("heading", { name: "Forecast accuracy" })).toBeInTheDocument();
  });
});
