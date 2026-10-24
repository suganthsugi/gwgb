import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { HourlyPoint } from "../api";
import { hhmm } from "../format";

const gwCell = (mw: number | null) => (mw === null ? "–" : (mw / 1000).toFixed(1));

/** FR-021: hour, lead time and forecast per hour. */
export default function HourlyTable({ points }: { points: HourlyPoint[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Hourly forecast">
        <TableHead>
          <TableRow>
            <TableCell>Hour</TableCell>
            <TableCell align="right">Lead time (h)</TableCell>
            <TableCell align="right">Forecast (GW)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {points.map((p) => (
            <TableRow key={p.time}>
              <TableCell>{hhmm(p.time)}</TableCell>
              {p.forecast === null ? (
                <TableCell colSpan={2} align="right" sx={{ color: "text.secondary" }}>
                  no forecast for this hour
                </TableCell>
              ) : (
                <>
                  <TableCell align="right">{p.horizonH?.toFixed(1)}</TableCell>
                  <TableCell align="right">{gwCell(p.forecast)}</TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
