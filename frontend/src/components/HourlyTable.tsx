import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { HourlyPoint } from "../api";
import { hhmm } from "../format";

const gwCell = (mw: number | null) => (mw === null ? "–" : (mw / 1000).toFixed(1));

/** FR-021: hour, lead time, forecast and likely range per hour. */
export default function HourlyTable({ points }: { points: HourlyPoint[] }) {
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
          </TableRow>
        </TableHead>
        <TableBody>
          {points.map((p) => (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
