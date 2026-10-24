import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { byHorizon, decision, metricsReport } from "./fixtures";
import { mockFetch } from "./setup";

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
