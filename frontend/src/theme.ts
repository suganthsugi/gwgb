import { createTheme } from "@mui/material/styles";

/** The single source of colour meaning (constitution Art. VI, FR-027). */
export const colors = {
  forecast: "#F59E0B", // amber
  actual: "#0D9488", // teal
  risk: "#D32F2F", // red
  neutral: "#64748B", // slate
} as const;

export const seriesStyle = {
  forecast: { dash: true },
  actual: { dash: false },
} as const;

export const theme = createTheme({
  palette: {
    primary: { main: "#1E3A5F" },
    warning: { main: colors.forecast },
    error: { main: colors.risk },
    background: { default: "#F5F7FA" },
  },
  typography: { fontSize: 14 },
});
