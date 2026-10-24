import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { render } from "@testing-library/react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useState, type ReactElement } from "react";
import type { View } from "../App";
import OutlookPage from "../pages/OutlookPage";
import { theme } from "../theme";

dayjs.extend(utc);

export function withProviders(ui: ReactElement) {
  return render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>{ui}</LocalizationProvider>
    </ThemeProvider>,
  );
}

function OutlookHarness({ initial }: { initial: Partial<View> }) {
  const [view, setView] = useState<View>({
    tab: "outlook",
    deliveryDate: "2026-01-15",
    cutoff: "09:00",
    showActuals: false,
    ...initial,
  });
  return <OutlookPage view={view} onChange={(patch) => setView((v) => ({ ...v, ...patch }))} />;
}

export function renderOutlook(initial: Partial<View> = {}) {
  return withProviders(<OutlookHarness initial={initial} />);
}
