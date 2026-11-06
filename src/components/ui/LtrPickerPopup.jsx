'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import Dialog from '@mui/material/Dialog';
import Popper from '@mui/material/Popper';
import { ThemeProvider } from '@mui/material/styles';
import { prefixer } from 'stylis';
import { ltrTheme } from '@/theme';

/*
 * A date picker's calendar laid out left to right inside the right-to-left app: days of the week from left to right,
 * the previous month's arrow on the left. The text field stays right to left; only the popup changes, through the
 * picker's popper (desktop) and dialog (mobile) slots.
 *
 * The app's style cache flips every CSS rule for right to left (MuiProvider's RTL plugin), so the popup gets a cache
 * without that plugin, a left to right theme (which the pickers read their arrows' direction from) and dir="ltr".
 */
const ltrCache = createCache({ key: 'mui-ltr', stylisPlugins: [prefixer] });

function LeftToRight({ children }) {
  return <CacheProvider value={ltrCache}>
    <ThemeProvider theme={ltrTheme}>{children}</ThemeProvider>
  </CacheProvider>;
}

/** The desktop popup: the picker's own popper (above dialogs, like its default), left to right. */
export function LtrPickerPopper(props) {
  return <LeftToRight>
    <Popper {...props} dir="ltr" sx={{ zIndex: 'modal' }} />
  </LeftToRight>;
}

/** The mobile popup: the picker's own dialog (at least the calendar's width, like its default), left to right. */
export function LtrPickerDialog(props) {
  return <LeftToRight>
    <Dialog {...props} dir="ltr" sx={{ '& .MuiDialog-container, & .MuiDialog-paper': { outline: 0 },
      '& .MuiDialog-paper': { minWidth: 320 } }} />
  </LeftToRight>;
}
