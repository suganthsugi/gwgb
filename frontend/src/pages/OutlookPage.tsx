import { Typography } from "@mui/material";
import type { View } from "../App";

interface Props {
  view: View;
  onChange: (patch: Partial<View>) => void;
}

export default function OutlookPage(_: Props) {
  return <Typography variant="h5">Day-ahead wind outlook</Typography>;
}
