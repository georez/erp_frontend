'use client';

import { Alert, Box } from '@mui/material';

/** A document form's window: the header, the alerts, the entry rows and grids, the actions, top to bottom. */
export function DocumentWindow({ children }) {
  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {children}
  </Box>;
}

/**
 * The form's messages: why the document or the comboboxes' options couldn't be loaded, and what a new document's
 * header lacks for its first line. Why a request failed is a toast (useDocument).
 */
export function DocumentAlerts({ loadError, optionsError, headerWarning }) {
  return <>
    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {headerWarning && <Alert severity="warning">{headerWarning}</Alert>}
  </>;
}

/** What the grid says while the document is new: the header comes first, then its first line creates the draft. */
export const NEW_DOCUMENT_HINT = 'أكمل رأس المستند، ثم أدخل السطر الأول بـ OK؛ عندها يُحفظ المستند مسودة';
