import { Card, CardContent, Typography } from "@mui/material";
import { colors } from "../theme";

interface Props {
  label: string;
  value: string;
  hint?: string;
  risk?: boolean;
}

export default function KpiCard({ label, value, hint, risk }: Props) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }} aria-label={label}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography
          variant="h5"
          component="p"
          data-risk={risk ? "true" : "false"}
          sx={{ color: risk ? colors.risk : "text.primary", fontWeight: 600 }}
        >
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
