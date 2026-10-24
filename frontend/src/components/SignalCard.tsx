import { Card, CardContent, Typography } from "@mui/material";
import type { Signal } from "../insights";
import { colors } from "../theme";

/** FR-017: the R6 signal, highlighted in amber when it warns. */
export default function SignalCard({ signal }: { signal: Signal | null }) {
  const warns = signal !== null && signal.level !== "close";
  return (
    <Card
      variant="outlined"
      role="region"
      aria-label="Signal"
      sx={{ height: "100%", borderLeft: warns ? `6px solid ${colors.forecast}` : undefined }}
    >
      <CardContent>
        {signal === null ? (
          <Typography color="text.secondary">
            Not enough history at this decision time to judge how the forecast has been running.
          </Typography>
        ) : (
          <>
            <Typography variant="h6" component="h3">
              {signal.title}
            </Typography>
            <Typography>{signal.text}</Typography>
            {signal.verdict && (
              <Typography sx={{ mt: 1, fontWeight: 600 }}>{signal.verdict}</Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
