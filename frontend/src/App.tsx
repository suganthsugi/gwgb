import { AppBar, Box, Container, CssBaseline, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useState } from "react";
import AccuracyPage from "./pages/AccuracyPage";
import OutlookPage from "./pages/OutlookPage";
import { theme } from "./theme";

dayjs.extend(utc);

export interface View {
  tab: "outlook" | "accuracy";
  deliveryDate: string;
  cutoff: string;
  showActuals: boolean;
}

const INITIAL_VIEW: View = {
  tab: "outlook",
  deliveryDate: "2026-01-02",
  cutoff: "09:00",
  showActuals: false,
};

export default function App() {
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const update = useCallback((patch: Partial<View>) => setView((v) => ({ ...v, ...patch })), []);
  const openDay = useCallback(
    (date: string) => update({ tab: "outlook", deliveryDate: date, showActuals: true }),
    [update],
  );

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <CssBaseline />
        <AppBar position="static" color="primary">
          <Toolbar sx={{ flexDirection: "column", alignItems: "flex-start", py: 1 }}>
            <Typography variant="h6" component="h1">
              REint Weather Forecast
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Day-ahead wind outlook and forecast reliability · GB national wind · Pilot: January
              2026
            </Typography>
          </Toolbar>
          <Tabs
            value={view.tab}
            onChange={(_, tab) => update({ tab })}
            textColor="inherit"
            indicatorColor="secondary"
            aria-label="Screens"
            sx={{ px: 2 }}
          >
            <Tab value="outlook" label="Day-ahead outlook" />
            <Tab value="accuracy" label="Forecast accuracy" />
          </Tabs>
        </AppBar>
        <Container maxWidth="lg" component="main" sx={{ py: 3 }}>
          {view.tab === "outlook" ? (
            <OutlookPage view={view} onChange={update} />
          ) : (
            <AccuracyPage onOpenDay={openDay} />
          )}
        </Container>
        <Box component="footer" sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
          <Typography variant="caption">
            Data: Elexon BMRS (FUELHH wind outturn, WINDFOR wind forecast), January 2026 snapshot
            · times in UTC (= UK time in January)
          </Typography>
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
