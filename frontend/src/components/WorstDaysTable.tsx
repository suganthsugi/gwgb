import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import type { DailyEntry } from "../api";
import { dayLabel, gw, signedGw } from "../format";

interface Props {
  days: DailyEntry[];
  onOpenDay: (date: string) => void;
}

/** FR-025: the 10 worst days by MAE, each with a drill-down into its outlook. */
export default function WorstDaysTable({ days, onOpenDay }: Props) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Worst days">
        <TableHead>
          <TableRow>
            <TableCell>Day</TableCell>
            <TableCell align="right">MAE</TableCell>
            <TableCell align="right">Bias</TableCell>
            <TableCell align="right">Average actual</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {days.map((d) => (
            <TableRow key={d.date}>
              <TableCell>{dayLabel(d.date)}</TableCell>
              <TableCell align="right">{gw(d.mae)}</TableCell>
              <TableCell align="right">{signedGw(d.bias)}</TableCell>
              <TableCell align="right">{gw(d.meanActual)}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  onClick={() => onOpenDay(d.date)}
                  aria-label={`Open day → ${dayLabel(d.date)}`}
                >
                  Open day →
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
