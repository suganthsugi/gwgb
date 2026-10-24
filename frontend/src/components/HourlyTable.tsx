import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { HourlyPoint } from "../api";
import { hhmm, signedGw } from "../format";
import { colors } from "../theme";

export const ERROR_RISK_MW = 3000;

const gwCell = (mw: number | null) => (mw === null ? "–" : (mw / 1000).toFixed(1));

function inRange(p: HourlyPoint): string {
  if (p.actual === null || p.low === null || p.high === null) return "–";
  return p.low <= p.actual && p.actual <= p.high ? "Yes" : "No";
}

interface Props {
  points: HourlyPoint[];
  showActuals: boolean;
}

/** FR-021: hour, lead time, forecast, likely range; with actuals also actual, error, in range. */
export default function HourlyTable({ points, showActuals }: Props) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Hourly forecast">
        <TableHead>
          <TableRow>
            <TableCell>Hour</TableCell>
            <TableCell align="right">Lead time (h)</TableCell>
            <TableCell align="right">Forecast (GW)</TableCell>
            <TableCell align="right">Low (GW)</TableCell>
            <TableCell align="right">High (GW)</TableCell>
            {showActuals && (
              <>
                <TableCell align="right">Actual (GW)</TableCell>
                <TableCell align="right">Error (GW)</TableCell>
                <TableCell align="right">In range</TableCell>
              </>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {points.map((p) => {
            const risk = p.error !== null && Math.abs(p.error) > ERROR_RISK_MW;
            return (
              <TableRow key={p.time}>
                <TableCell>{hhmm(p.time)}</TableCell>
                {p.forecast === null ? (
                  <TableCell colSpan={4} align="right" sx={{ color: "text.secondary" }}>
                    no forecast for this hour
                  </TableCell>
                ) : (
                  <>
                    <TableCell align="right">{p.horizonH?.toFixed(1)}</TableCell>
                    <TableCell align="right">{gwCell(p.forecast)}</TableCell>
                    <TableCell align="right">{gwCell(p.low)}</TableCell>
                    <TableCell align="right">{gwCell(p.high)}</TableCell>
                  </>
                )}
                {showActuals && (
                  <>
                    <TableCell align="right">{gwCell(p.actual)}</TableCell>
                    <TableCell
                      align="right"
                      data-risk={String(risk)}
                      sx={{ color: risk ? colors.risk : undefined, fontWeight: risk ? 600 : undefined }}
                    >
                      {p.error === null ? "–" : signedGw(p.error).replace(" GW", "")}
                    </TableCell>
                    <TableCell align="right">{inRange(p)}</TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
