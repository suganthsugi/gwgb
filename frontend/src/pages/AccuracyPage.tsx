import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import {
  ApiError,
  fetchByHorizon,
  fetchMetrics,
  type HorizonBucket,
  type MetricsReport,
} from "../api";
import AccuracyCharts, { type Loaded } from "../components/AccuracyCharts";
import DataState from "../components/DataState";
import KpiCard from "../components/KpiCard";
import WorstDaysTable from "../components/WorstDaysTable";
import { gw, signedGw } from "../format";
import { BIAS_RISK_MW } from "./OutlookPage";

interface Props {
  onOpenDay: (date: string) => void;
}

function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ loading: true, error: null, data: null });
  useEffect(() => {
    let live = true;
    load()
      .then((data) => {
        if (live) setState({ loading: false, error: null, data });
      })
      .catch((err: unknown) => {
        const detail = err instanceof ApiError ? err.detail : String(err);
        if (live) setState({ loading: false, error: detail, data: null });
      });
    return () => {
      live = false;
    };
  }, [load]);
  return state;
}

export default function AccuracyPage({ onOpenDay }: Props) {
  const report = useLoad<MetricsReport>(fetchMetrics);
  const horizon = useLoad<HorizonBucket[]>(fetchByHorizon);
  const m = report.data?.metrics;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" component="h2">
          Forecast accuracy
        </Typography>
        <Typography color="text.secondary">
          How far the forecast available at 09:00 the day before was from outturn, across every
          hour of the January 2026 pilot.
        </Typography>
      </Box>

      <DataState loading={report.loading} error={report.error} height={90}>
        {m && (
          <Grid container spacing={2}>
            <Grid item xs={6} md={2.4}>
              <KpiCard
                label="MAE"
                value={gw(m.mae)}
                hint={m.nmaePct === null ? undefined : `${m.nmaePct.toFixed(1)}% of average actual`}
              />
            </Grid>
            <Grid item xs={6} md={2.4}>
              <KpiCard
                label="Bias"
                value={signedGw(m.bias)}
                hint={m.bias >= 0 ? "Forecast too high on average" : "Forecast too low on average"}
                risk={Math.abs(m.bias) > BIAS_RISK_MW}
              />
            </Grid>
            <Grid item xs={6} md={2.4}>
              <KpiCard label="RMSE" value={gw(m.rmse)} hint="Weights large misses more" />
            </Grid>
            <Grid item xs={6} md={2.4}>
              <KpiCard label="P90 error" value={gw(m.p90AbsError)} hint="9 hours in 10 miss by less" />
            </Grid>
            <Grid item xs={12} md={2.4}>
              <KpiCard label="Hours scored" value={m.n.toLocaleString("en-GB")} />
            </Grid>
          </Grid>
        )}
      </DataState>

      <AccuracyCharts report={report} horizon={horizon} onOpenDay={onOpenDay} />

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" component="h3">
            Worst 10 days
          </Typography>
          <DataState loading={report.loading} error={report.error} height={240}>
            {report.data && <WorstDaysTable days={report.data.worstDays} onOpenDay={onOpenDay} />}
          </DataState>
        </CardContent>
      </Card>
    </Stack>
  );
}
