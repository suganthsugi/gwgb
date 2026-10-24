import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MetricsReport } from "../api";
import AccuracyPage from "../pages/AccuracyPage";
import { byHorizon, metricsReport } from "./fixtures";
import { withProviders } from "./render";
import { mockFetch } from "./setup";

function route(report: MetricsReport = metricsReport) {
  return mockFetch({
    "/api/metrics/by-horizon": { body: byHorizon },
    "/api/metrics": { body: report },
  });
}

const withBias = (bias: number): MetricsReport => ({
  ...metricsReport,
  metrics: { ...metricsReport.metrics, bias },
});

describe("AccuracyPage — US4", () => {
  it("shows the header (FR-022)", () => {
    route();
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Forecast accuracy" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "How far the forecast available at 09:00 the day before was from outturn, across every hour of the January 2026 pilot.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the headline KPIs (FR-023, AC9)", async () => {
    route();
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    expect(await screen.findByLabelText("MAE")).toHaveTextContent("2.0 GW");
    expect(screen.getByLabelText("MAE")).toHaveTextContent("21.3%");
    expect(screen.getByLabelText("Bias")).toHaveTextContent("+1.7 GW");
    expect(screen.getByLabelText("RMSE")).toHaveTextContent("2.5 GW");
    expect(screen.getByLabelText("P90 error")).toHaveTextContent("4.2 GW");
    expect(screen.getByLabelText("Hours scored")).toHaveTextContent("744");
  });

  it.each([
    [1200, true],
    [-1200, true],
    [900, false],
  ])("colours a pilot bias of %d MW as risk: %s", async (bias, risk) => {
    route(withBias(bias));
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    const card = await screen.findByLabelText("Bias");
    expect(within(card).getByText(/GW$/)).toHaveAttribute("data-risk", String(risk));
  });

  it("renders the four charts (FR-024, AC10)", async () => {
    route();
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    for (const title of ["Error by lead time", "Bias by hour of day", "Error distribution", "Bias by day"]) {
      expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("forecast too low")).toBeInTheDocument();
    expect(screen.getByText("forecast too high")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart")).toHaveLength(4);
  });

  it("lists the 10 worst days with an Open day button each (FR-025)", async () => {
    route();
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Worst days" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText("28 Jan")).toBeInTheDocument();
    for (const row of rows) {
      expect(within(row).getByRole("button", { name: /Open day →/ })).toBeInTheDocument();
    }
  });

  it("shows the error message in every data area when loading fails (AC12)", async () => {
    mockFetch({
      "/api/metrics/by-horizon": { status: 500, body: { detail: "Data snapshot not found." } },
      "/api/metrics": { status: 500, body: { detail: "Data snapshot not found." } },
    });
    withProviders(<AccuracyPage onOpenDay={vi.fn()} />);
    const errors = await screen.findAllByText("Couldn't load data: Data snapshot not found.");
    // KPIs, four charts, worst-days table
    expect(errors).toHaveLength(6);
  });
});
