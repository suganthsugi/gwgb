import { Alert } from "@mui/material";
import type { Decision } from "../api";
import { dayLabel, duration, previousDay, runLabel } from "../format";

/** FR-016: which run is in use, or the explicit no-run state. */
export default function RunInUseAlert({ decision }: { decision: Decision }) {
  if (decision.usedRun === null || decision.minutesBeforeCutoff === null) {
    const text =
      `No forecast run was published before ${decision.cutoff} on ` +
      `${dayLabel(previousDay(decision.deliveryDate))}, so there is no outlook for this decision time.`;
    return <Alert severity="warning">{text}</Alert>;
  }
  const text =
    `Forecast run in use: ${runLabel(decision.usedRun)}, published ` +
    `${duration(decision.minutesBeforeCutoff)} before the decision time. Later runs are excluded.`;
  return <Alert severity="info">{text}</Alert>;
}
