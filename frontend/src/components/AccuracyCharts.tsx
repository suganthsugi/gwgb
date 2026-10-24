import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import type { ApexOptions } from "apexcharts";
import type { ReactNode } from "react";
import Chart from "react-apexcharts";
import type { HorizonBucket, MetricsReport } from "../api";
import { dayLabel, gw } from "../format";
import { colors } from "../theme";
import DataState from "./DataState";

export interface Loaded<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

interface Props {
  report: Loaded<MetricsReport>;
  horizon: Loaded<HorizonBucket[]>;
  onOpenDay: (date: string) => void;
}

const toGw = (mw: number | null) => (mw === null ? null : Number((mw / 1000).toFixed(2)));

function base(id: string, color: string): ApexOptions {
  return {
    chart: { id, toolbar: { show: false }, animations: { enabled: false } },
    colors: [color],
    dataLabels: { enabled: false },
    yaxis: { title: { text: "GW" }, labels: { formatter: (v) => v.toFixed(1) } },
    tooltip: { y: { formatter: (v) => gw(v * 1000) } },
  };
}

function ChartCard<T>(props: {
  title: string;
  state: Loaded<T>;
  children: (data: T) => ReactNode;
}) {
  const { title, state, children } = props;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" component="h3">
          {title}
        </Typography>
        <DataState loading={state.loading} error={state.error} height={240}>
          {state.data !== null && children(state.data)}
        </DataState>
      </CardContent>
    </Card>
  );
}

/** FR-024: four charts in a 2×2 grid, stacked on small screens. Values in GW. */
export default function AccuracyCharts({ report, horizon, onOpenDay }: Props) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <ChartCard title="Error by lead time" state={horizon}>
          {(buckets) => (
            <Chart
              type="bar"
              height={240}
              series={[
                { name: "MAE", data: buckets.map((b) => ({ x: b.bucket, y: toGw(b.mae) })) },
              ]}
              options={{
                ...base("lead-time", colors.neutral),
                xaxis: { type: "category", title: { text: "Lead time (target hour − publish time)" } },
              }}
            />
          )}
        </ChartCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartCard title="Bias by hour of day" state={report}>
          {(r) => (
            <Chart
              type="bar"
              height={240}
              series={[
                {
                  name: "Bias",
                  data: r.byHour.map((h) => ({
                    x: `${String(h.hour).padStart(2, "0")}:00`,
                    y: toGw(h.bias),
                  })),
                },
              ]}
              options={{
                ...base("bias-hour", colors.neutral),
                xaxis: { type: "category", title: { text: "Hour (UTC)" } },
                annotations: { yaxis: [{ y: 0, borderColor: colors.risk }] },
              }}
            />
          )}
        </ChartCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartCard title="Error distribution" state={report}>
          {(r) => (
            <>
              <Chart
                type="bar"
                height={220}
                series={[
                  { name: "Hours", data: r.histogram.map((b) => ({ x: b.label, y: b.count })) },
                ]}
                options={{
                  ...base("histogram", colors.neutral),
                  yaxis: { title: { text: "Hours" } },
                  tooltip: { y: { formatter: (v) => `${v} hours` } },
                  xaxis: { type: "category", title: { text: "Error (forecast − actual)" } },
                  annotations: {
                    xaxis: [
                      {
                        x: r.histogram.find((b) => b.fromMw === 0)?.label,
                        borderColor: colors.risk,
                        strokeDashArray: 0,
                      },
                    ],
                  },
                }}
              />
              <Stack direction="row" justifyContent="space-between">
                <Box component="span" sx={{ color: "text.secondary", fontSize: 13 }}>
                  <span aria-hidden="true">← </span>
                  <span>forecast too low</span>
                </Box>
                <Box component="span" sx={{ color: "text.secondary", fontSize: 13 }}>
                  <span>forecast too high</span>
                  <span aria-hidden="true"> →</span>
                </Box>
              </Stack>
            </>
          )}
        </ChartCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartCard title="Bias by day" state={report}>
          {(r) => (
            <>
              <Chart
                type="bar"
                height={220}
                series={[
                  { name: "Bias", data: r.daily.map((d) => ({ x: dayLabel(d.date), y: toGw(d.bias) })) },
                ]}
                options={{
                  ...base("bias-day", colors.neutral),
                  chart: {
                    id: "bias-day",
                    toolbar: { show: false },
                    animations: { enabled: false },
                    events: {
                      dataPointSelection: (_e: unknown, _c: unknown, config: { dataPointIndex: number }) => {
                        const day = r.daily[config.dataPointIndex];
                        if (day) onOpenDay(day.date);
                      },
                    },
                  },
                  xaxis: { type: "category", title: { text: "Delivery day" } },
                  annotations: { yaxis: [{ y: 0, borderColor: colors.risk }] },
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Click a day to open its outlook with actual outturn shown.
              </Typography>
            </>
          )}
        </ChartCard>
      </Grid>
    </Grid>
  );
}
