import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Decision } from "../api";
import { decision, decisionAt1200, decisionNoActuals, decisionNoRun, decisionPartial } from "./fixtures";
import { renderOutlook } from "./render";
import { mockFetch } from "./setup";

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
