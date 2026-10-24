import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { View } from "../App";
import { ApiError, fetchDecision, type Decision } from "../api";
import ControlsCard from "../components/ControlsCard";
import DataState from "../components/DataState";
import HourlyTable from "../components/HourlyTable";
import KpiCard from "../components/KpiCard";
import OutlookChart from "../components/OutlookChart";
import RunInUseAlert from "../components/RunInUseAlert";
import { dayLabel, dayMwh, gw, previousDay } from "../format";

interface Props {
  view: View;
  onChange: (patch: Partial<View>) => void;
}

interface Load {
  loading: boolean;
  error: string | null;
  data: Decision | null;
}

export function mean(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export default function OutlookPage({ view, onChange }: Props) {
  const { deliveryDate, cutoff } = view;
  const [state, setState] = useState<Load>({ loading: true, error: null, data: null });

  useEffect(() => {
    let live = true;
    setState({ loading: true, error: null, data: null });
    fetchDecision(deliveryDate, cutoff)
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
  }, [deliveryDate, cutoff]);

  const { loading, error } = state;
  const d = state.data;
  const hasRun = d !== null && d.usedRun !== null;
  const forecastMean = d ? mean(d.points.map((p) => p.forecast)) : null;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" component="h2">
          Day-ahead wind outlook
        </Typography>
        <Typography color="text.secondary">
          {`Wind forecast for ${dayLabel(deliveryDate)} as it stood at ${cutoff} on ` +
            `${dayLabel(previousDay(deliveryDate))}, with the error you should expect.`}
        </Typography>
      </Box>

      <ControlsCard
        deliveryDate={deliveryDate}
        cutoff={cutoff}
        showActuals={view.showActuals}
        onChange={onChange}
      />

      <DataState loading={loading} error={error} height={48}>
        {d && <RunInUseAlert decision={d} />}
      </DataState>

      {(loading || error || hasRun) && (
        <>
          <DataState loading={loading} error={error} height={90}>
            {d && (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <KpiCard
                    label="Forecast average"
                    value={forecastMean === null ? "–" : gw(forecastMean)}
                    hint={`${dayMwh(d.points)} for the day`}
                  />
                </Grid>
              </Grid>
            )}
          </DataState>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h3">
                Hourly outlook
              </Typography>
              <DataState loading={loading} error={error} height={320}>
                {d && <OutlookChart points={d.points} />}
              </DataState>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h3">
                Hour by hour
              </Typography>
              <DataState loading={loading} error={error} height={240}>
                {d && <HourlyTable points={d.points} />}
              </DataState>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
