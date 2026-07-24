'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@/theme';
import { CssBaseline } from "@mui/material";
import { prefixer } from 'stylis';
import rtlPlugin from '@mui/stylis-plugin-rtl';

export default function MuiProvider({ children }) {
  return (
      <AppRouterCacheProvider options={{
        key: 'muirtl', // Unique key for the RTL cache
        stylisPlugins: [prefixer, rtlPlugin], // Flips CSS rules automatically
        // enableCssLayer: true, // Optional: prevents CSS specificity issues
      }}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </AppRouterCacheProvider>
  );
}
