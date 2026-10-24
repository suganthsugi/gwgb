import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import {
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { addDays } from "../format";

export const FIRST_DAY = "2026-01-02";
export const LAST_DAY = "2026-02-01";
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

interface Props {
  deliveryDate: string;
  cutoff: string;
  showActuals: boolean;
  onChange: (patch: { deliveryDate?: string; cutoff?: string; showActuals?: boolean }) => void;
}

/** Delivery day, decision time and the actuals switch (FR-015, FR-029). Fully controlled. */
export default function ControlsCard({ deliveryDate, cutoff, showActuals, onChange }: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <DatePicker
              label="Delivery day"
              timezone="UTC"
              format="D MMM YYYY"
              value={dayjs.utc(deliveryDate)}
              minDate={dayjs.utc(FIRST_DAY)}
              maxDate={dayjs.utc(LAST_DAY)}
              onChange={(v) => {
                if (v && v.isValid()) {
                  const next = v.format("YYYY-MM-DD");
                  if (next >= FIRST_DAY && next <= LAST_DAY) onChange({ deliveryDate: next });
                }
              }}
              slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
            />
            <IconButton
              aria-label="Previous day"
              disabled={deliveryDate <= FIRST_DAY}
              onClick={() => onChange({ deliveryDate: addDays(deliveryDate, -1) })}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              aria-label="Next day"
              disabled={deliveryDate >= LAST_DAY}
              onClick={() => onChange({ deliveryDate: addDays(deliveryDate, 1) })}
            >
              <ChevronRight />
            </IconButton>
          </Stack>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="cutoff-label">Decision time</InputLabel>
            <Select
              labelId="cutoff-label"
              label="Decision time"
              value={cutoff}
              onChange={(e) => onChange({ cutoff: e.target.value })}
            >
              {HOURS.map((h) => (
                <MenuItem key={h} value={h}>
                  {h === "09:00" ? "09:00 (before auction close)" : h}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={showActuals}
                onChange={(e) => onChange({ showActuals: e.target.checked })}
              />
            }
            label="Show actual outturn"
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
