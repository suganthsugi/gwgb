import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import type { Decision } from "../api";
import { decision, decisionAt1200, decisionNoActuals, decisionNoRun, decisionPartial } from "./fixtures";
import { renderOutlook } from "./render";
import { chartWithSeries, mockFetch } from "./setup";

function routeDecision(byCutoff: Record<string, Decision> = {}) {
  return mockFetch({
    "/api/decision": (url) => {
      const cutoff = new URL(url, "http://x").searchParams.get("cutoff") ?? "09:00";
      return { body: byCutoff[cutoff] ?? decisionNoActuals };
    },
  });
}

const lastUrl = (fn: ReturnType<typeof mockFetch>) => String(fn.mock.calls.at(-1)?.[0]);

describe("OutlookPage — US1", () => {
  it("shows the header for the chosen day and decision time (FR-014)", async () => {
    routeDecision();
    renderOutlook();
    expect(screen.getByRole("heading", { name: "Day-ahead wind outlook" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Wind forecast for 15 Jan as it stood at 09:00 on 14 Jan, with the error you should expect.",
      ),
    ).toBeInTheDocument();
  });

  it("names the run in use and its age (AC1)", async () => {
    routeDecision();
    renderOutlook();
    expect(
      await screen.findByText(
        "Forecast run in use: 14 Jan 07:30, published 1 h 30 min before the decision time. Later runs are excluded.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
  });

  it("refetches with the new decision time (AC2)", async () => {
    const fetch = routeDecision({ "12:00": decisionAt1200 });
    renderOutlook();
    await screen.findByText(/Forecast run in use: 14 Jan 07:30/);
    await userEvent.click(screen.getByRole("combobox", { name: "Decision time" }));
    await userEvent.click(screen.getByRole("option", { name: "12:00" }));
    await waitFor(() => expect(lastUrl(fetch)).toContain("cutoff=12%3A00"));
    expect(await screen.findByText(/Forecast run in use: 14 Jan 11:30/)).toBeInTheDocument();
  });

  it("moves the day with the previous and next buttons", async () => {
    const fetch = routeDecision();
    renderOutlook();
    await screen.findByText(/Forecast run in use/);
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(lastUrl(fetch)).toContain("delivery_date=2026-01-16"));
    expect(screen.getByText(/Wind forecast for 16 Jan as it stood at 09:00 on 15 Jan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(lastUrl(fetch)).toContain("delivery_date=2026-01-14"));
  });

  it("disables the day buttons at the ends of the pilot window", async () => {
    routeDecision();
    renderOutlook({ deliveryDate: "2026-01-02" });
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
  });

  it("shows the no-run message and no numbers when no run precedes the cutoff", async () => {
    routeDecision({ "00:00": decisionNoRun });
    renderOutlook({ cutoff: "00:00" });
    expect(
      await screen.findByText(
        "No forecast run was published before 00:00 on 14 Jan, so there is no outlook for this decision time.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("shows the error message when loading fails (AC12)", async () => {
    mockFetch({ "/api/decision": { status: 500, body: { detail: "Data snapshot not found." } } });
    renderOutlook();
    const errors = await screen.findAllByText("Couldn't load data: Data snapshot not found.");
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("marks hours that no run covers", async () => {
    routeDecision({ "09:00": decisionPartial });
    renderOutlook();
    const rows = await screen.findAllByRole("row");
    expect(within(rows[23]).getByText("no forecast for this hour")).toBeInTheDocument();
    expect(within(rows[24]).getByText("no forecast for this hour")).toBeInTheDocument();
    expect(within(rows[22]).queryByText("no forecast for this hour")).not.toBeInTheDocument();
  });

  it("shows the forecast average in GW and MWh", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    const card = await screen.findByLabelText("Forecast average");
    expect(card).toHaveTextContent("11.7 GW");
    expect(card).toHaveTextContent("280,000 MWh");
  });
});

describe("OutlookPage — US2", () => {
  it("shows the signal card title and text", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    const card = await screen.findByRole("region", { name: "Signal" });
    expect(within(card).getByText("Forecast likely too high")).toBeInTheDocument();
    expect(card).toHaveTextContent("1.8 GW above actual wind");
  });

  it("lists the watch-list items in order", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    const list = await screen.findByRole("list", { name: "Watch list" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toMatch(/^Widest likely range at 17:00/);
    expect(items[1]).toMatch(/^Least wind at 16:00/);
    expect(items[2]).toMatch(/^Steepest change/);
    expect(items[3]).toMatch(/^Change against the run 24 h earlier/);
  });

  it("shows the drift chart, the comparison cards and the covered hours", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    await screen.findByRole("region", { name: "Signal" });
    const drift = chartWithSeries("Mean forecast");
    expect(drift?.series[0].data).toHaveLength(8);
    expect(screen.getByLabelText("vs previous run")).toHaveTextContent("No change");
    expect(screen.getByLabelText("vs run 24 h earlier")).toHaveTextContent("−0.3 GW");
    expect(screen.getByLabelText("vs run 24 h earlier")).toHaveTextContent("18:00");
    expect(screen.getByText(/Covers 00:00–21:00/)).toBeInTheDocument();
  });

  it("does not state covered hours when all 24 are covered", async () => {
    routeDecision({ "09:00": { ...decision, driftHours: { from: "00:00", to: "23:00", count: 24 } } });
    renderOutlook();
    await screen.findByRole("region", { name: "Signal" });
    expect(screen.queryByText(/Covers /)).not.toBeInTheDocument();
  });

  it("shows the typical error range and the likely-range band", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    // 11,666.7 − 4,300 = 7.4 GW … 11,666.7 + 1,200 = 12.9 GW
    expect(await screen.findByLabelText("Typical error range")).toHaveTextContent("7.4–12.9 GW");
    expect(chartWithSeries("Likely range (P10–P90)")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Low (GW)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "High (GW)" })).toBeInTheDocument();
  });
});

describe("OutlookPage — US3 (AC6)", () => {
  const withDayBias = (bias: number): Decision => ({
    ...decision,
    metrics: { ...decision.metrics!, bias },
  });

  it("hides every actual-outturn element while the switch is off", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    await screen.findByRole("region", { name: "Signal" });
    expect(screen.getByLabelText("Show actual outturn")).not.toBeChecked();
    expect(chartWithSeries("Actual")).toBeUndefined();
    for (const name of ["Actual (GW)", "Error (GW)", "In range"]) {
      expect(screen.queryByRole("columnheader", { name })).not.toBeInTheDocument();
    }
    for (const label of ["Actual average", "Bias", "MAE"]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Actual wind averaged/)).not.toBeInTheDocument();
  });

  it("shows them when the switch is turned on", async () => {
    routeDecision({ "09:00": decision });
    renderOutlook();
    await screen.findByRole("region", { name: "Signal" });
    await userEvent.click(screen.getByLabelText("Show actual outturn"));
    expect(chartWithSeries("Actual")).toBeDefined();
    for (const name of ["Actual (GW)", "Error (GW)", "In range"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Actual average")).toHaveTextContent("10.2 GW");
    expect(screen.getByLabelText("Bias")).toHaveTextContent("+1.5 GW");
    expect(screen.getByLabelText("MAE")).toHaveTextContent("1.5 GW");
    expect(screen.getByText(/Actual wind averaged/)).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "Yes" }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText("Show actual outturn"));
    expect(screen.queryByLabelText("Bias")).not.toBeInTheDocument();
  });

  it.each([
    [1200, true, "buyer would be short"],
    [-1200, true, "buyer would be long"],
    [900, false, "buyer would be short"],
  ])("colours a day bias of %d MW as risk: %s", async (bias, risk, hint) => {
    routeDecision({ "09:00": withDayBias(bias) });
    renderOutlook({ showActuals: true });
    const card = await screen.findByLabelText("Bias");
    expect(within(card).getByText(/GW$/)).toHaveAttribute("data-risk", String(risk));
    expect(card).toHaveTextContent(hint);
  });

  it("colours hourly errors above 3 GW as risk", async () => {
    const big: Decision = {
      ...decision,
      points: decision.points.map((p, h) => (h === 3 ? { ...p, actual: 8500, error: 3500 } : p)),
    };
    routeDecision({ "09:00": big });
    renderOutlook({ showActuals: true });
    const rows = await screen.findAllByRole("row");
    expect(within(rows[4]).getByText("+3.5")).toHaveAttribute("data-risk", "true");
    expect(within(rows[5]).getByText("+1.5")).toHaveAttribute("data-risk", "false");
  });
});

describe("Keyboard access (FR-029, Art. VI)", () => {
  it("reaches every control by Tab, in order, each with an accessible name", async () => {
    routeDecision({ "09:00": decision });
    render(<App />);
    await screen.findByText(/Forecast run in use/);
    // move off 2 Jan so "Previous day" is enabled, then start tabbing from the top
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    await screen.findByText(/Forecast run in use/);
    (document.activeElement as HTMLElement | null)?.blur();
    const targets = [
      screen.getByRole("tab", { name: "Day-ahead outlook" }),
      screen.getByRole("textbox", { name: "Delivery day" }),
      screen.getByRole("button", { name: "Previous day" }),
      screen.getByRole("button", { name: "Next day" }),
      screen.getByRole("combobox", { name: "Decision time" }),
      screen.getByRole("checkbox", { name: "Show actual outturn" }),
    ];
    const visited: Element[] = [];
    for (let i = 0; i < 20 && visited.length < 40; i++) {
      await userEvent.tab();
      if (document.activeElement) visited.push(document.activeElement);
    }
    const positions = targets.map((t) => visited.indexOf(t));
    expect(positions.every((p) => p >= 0), `positions ${positions}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
