import { Card, CardContent, Grid, Typography } from "@mui/material";
import type { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";
import type { Decision, RunComparison } from "../api";
import { gw, hhmm, runLabel, signedGw } from "../format";
import { colors } from "../theme";
import KpiCard from "./KpiCard";

function ComparisonCard({ label, c }: { label: string; c: RunComparison | null }) {
  if (c === null || c.otherRun === null) {
    return <KpiCard label={label} value="–" hint="No earlier run covers this day." />;
  }
  if (c.identical) {
    return <KpiCard label={label} value="No change" hint={`Same as ${runLabel(c.otherRun)}`} />;
  }
  const move = c.biggestMove
    ? `Biggest single-hour move ${signedGw(c.biggestMove.delta)} at ${hhmm(c.biggestMove.time)}`
    : undefined;
  const against =
    c.basis === "previous" && label !== "vs previous run"
      ? `previous run ${runLabel(c.otherRun)} (no run 24 h earlier)`
      : runLabel(c.otherRun);
  return (
    <KpiCard
      label={label}
      value={signedGw(c.meanChange)}
      hint={`${move ? `${move}; ` : ""}against ${against}`}
    />
  );
}

/** FR-020, R8: mean forecast of the last runs before the cutoff, and two change cards. */
export default function DriftPanel({ decision }: { decision: Decision }) {
  const { drift, driftHours } = decision;
  const options: ApexOptions = {
    chart: { id: "drift", toolbar: { show: false }, animations: { enabled: false } },
    colors: [colors.forecast],
    stroke: { width: 2, dashArray: 6 },
    markers: { size: 4 },
    xaxis: { type: "category", title: { text: "Run published (UTC)" } },
    yaxis: { title: { text: "GW" }, labels: { formatter: (v) => v.toFixed(1) } },
    tooltip: { y: { formatter: (v) => gw(v * 1000) } },
  };
  const series = [
    {
      name: "Mean forecast",
      data: drift.map((e) => ({ x: runLabel(e.publishTime), y: e.meanForecast / 1000 })),
    },
  ];
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h3">
          How the forecast has moved
        </Typography>
        {driftHours && driftHours.count < 24 && (
          <Typography variant="body2" color="text.secondary">
            {`Covers ${driftHours.from}–${driftHours.to} (${driftHours.count} hours), the hours ` +
              "every run shown includes."}
          </Typography>
        )}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} md={8}>
            {drift.length === 0 ? (
              <Typography color="text.secondary">No earlier runs to compare.</Typography>
            ) : (
              <Chart type="line" height={220} series={series} options={options} />
            )}
          </Grid>
          <Grid item xs={12} md={4}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <ComparisonCard label="vs previous run" c={decision.changeVsPrevious} />
              </Grid>
              <Grid item xs={12}>
                <ComparisonCard label="vs run 24 h earlier" c={decision.changeVs24h} />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
