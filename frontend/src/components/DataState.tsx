import { Alert, Skeleton, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface Props {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  children: ReactNode;
}

/** Loading, error and empty states for every data area (FR-028, Art. VI). */
export default function DataState({ loading, error, empty, emptyText, height = 120, children }: Props) {
  if (loading) return <Skeleton variant="rounded" height={height} data-testid="loading" />;
  if (error) return <Alert severity="error">Couldn't load data: {error}</Alert>;
  if (empty) return <Typography color="text.secondary">{emptyText ?? "No data."}</Typography>;
  return <>{children}</>;
}
