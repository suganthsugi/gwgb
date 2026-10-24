import { Typography } from "@mui/material";

interface Props {
  onOpenDay: (date: string) => void;
}

export default function AccuracyPage(_: Props) {
  return <Typography variant="h5">Forecast accuracy</Typography>;
}
