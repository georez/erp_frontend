import { useMediaQuery, useTheme } from "@mui/material";

/**
 * True on tablet-sized screens and smaller (below the theme's md breakpoint). There the dashboard doesn't use
 * draggable windows: the menu navigates to a form's own page, and report links open in a new tab.
 */
export function useIsTabletOrSmaller() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
