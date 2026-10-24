import { Card, CardContent, List, ListItem, Typography } from "@mui/material";
import type { WatchItem } from "../insights";

/** FR-017: the R7 watch list, in its fixed order. */
export default function WatchListCard({ items }: { items: WatchItem[] }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" component="h3" id="watch-list-title">
          Watch list
        </Typography>
        {items.length === 0 ? (
          <Typography color="text.secondary">Nothing to flag for this day.</Typography>
        ) : (
          <List component="ol" dense aria-label="Watch list" sx={{ listStyle: "decimal", pl: 3 }}>
            {items.map((item) => (
              <ListItem key={item.kind} sx={{ display: "list-item", px: 0 }}>
                {item.text}
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
