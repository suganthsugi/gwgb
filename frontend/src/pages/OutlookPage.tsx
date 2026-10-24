import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { View } from "../App";
import { ApiError, fetchDecision, type Decision } from "../api";
import ControlsCard from "../components/ControlsCard";
import DataState from "../components/DataState";
import DriftPanel from "../components/DriftPanel";
import HourlyTable from "../components/HourlyTable";
import KpiCard from "../components/KpiCard";
import OutlookChart from "../components/OutlookChart";
import RunInUseAlert from "../components/RunInUseAlert";
import SignalCard from "../components/SignalCard";
import WatchListCard from "../components/WatchListCard";
import { dayLabel, dayMwh, gw, previousDay, signedGw } from "../format";
import { signal, watchList } from "../insights";

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

export const BIAS_RISK_MW = 1000;

function biasHint(bias: number): string {
  if (bias > 0) return "Forecast too high — buyer would be short";
  if (bias < 0) return "Forecast too low — buyer would be long";
  return "Forecast on target";
}

/** FR-018: the day's actual average, bias and MAE (only when actuals are shown). */
function ActualCards({ metrics }: { metrics: Decision["metrics"] }) {
  if (metrics === null) {
    return (
      <Grid item xs={12} md={6}>
        <KpiCard label="Actual average" value="–" hint="No actual outturn for this day yet." />
      </Grid>
    );
  }
  return (
    <>
      <Grid item xs={12} sm={4} md={2}>
        <KpiCard label="Actual average" value={gw(metrics.meanActual)} />
      </Grid>
      <Grid item xs={12} sm={4} md={2}>
        <KpiCard
          label="Bias"
          value={signedGw(metrics.bias)}
          hint={biasHint(metrics.bias)}
          risk={Math.abs(metrics.bias) > BIAS_RISK_MW}
        />
      </Grid>
      <Grid item xs={12} sm={4} md={2}>
        <KpiCard label="MAE" value={gw(metrics.mae)} hint="Average size of the hourly error" />
      </Grid>
    </>
  );
}

export default function OutlookPage({ view, onChange }: Props) {
  const { deliveryDate, cutoff, showActuals } = view;
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
  const typicalRange =
    forecastMean !== null && d?.band
      ? `${gw(forecastMean - d.band.q90Error).replace(" GW", "")}–` +
        `${gw(forecastMean - d.band.q10Error)}`
      : "–";

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
        showActuals={showActuals}
        onChange={onChange}
      />

      <DataState loading={loading} error={error} height={48}>
        {d && <RunInUseAlert decision={d} />}
      </DataState>

      {(loading || error || hasRun) && (
        <>
          <DataState loading={loading} error={error} height={140}>
            {d && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <SignalCard signal={signal(d, { showActuals })} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <WatchListCard items={watchList(d)} />
                </Grid>
              </Grid>
            )}
          </DataState>

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
                <Grid item xs={12} sm={6} md={3}>
                  <KpiCard
                    label="Typical error range"
                    value={typicalRange}
                    hint={
                      d.history
                        ? `Around the day's average forecast, from the last ${d.history.days} days' errors`
                        : undefined
                    }
                  />
                </Grid>
                {showActuals && <ActualCards metrics={d.metrics} />}
              </Grid>
            )}
          </DataState>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h3">
                Hourly outlook
              </Typography>
              <DataState loading={loading} error={error} height={320}>
                {d && <OutlookChart points={d.points} showActuals={showActuals} />}
              </DataState>
            </CardContent>
          </Card>

          <DataState loading={loading} error={error} height={220}>
            {d && <DriftPanel decision={d} />}
          </DataState>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h3">
                Hour by hour
              </Typography>
              <DataState loading={loading} error={error} height={240}>
                {d && <HourlyTable points={d.points} showActuals={showActuals} />}
              </DataState>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
