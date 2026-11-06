'use client';
import { createTheme } from '@mui/material/styles';

const themeOptions = {
  typography: {
    fontFamily: 'var(--font-cairo)',
  },
};

export const theme = createTheme({
  ...themeOptions,
  direction: 'rtl',
  cssVariables: true,
});

/**
 * The same look, left to right, for the parts of the right-to-left app laid out left to right (a date picker's
 * calendar, see LtrPickerPopup). Without CSS variables: the app's theme already puts its variables on the page.
 */
export const ltrTheme = createTheme({
  ...themeOptions,
  direction: 'ltr',
});
