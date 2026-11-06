'use client';

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import FormFields from '@/components/forms/FormFields';

/**
 * The frame of a report page (useReportPage): the params and Run in a row with the page's own controls, the errors,
 * and the page's content filling the rest. Before the first run, and for a run without rows, a line of text instead.
 *
 * @param {object} props.report  what useReportPage returns
 * @param {React.ReactNode} [props.controls]  the page's own controls, at the row's far end
 * @param {string} props.emptyText  shown after a run without rows
 * @param {React.ReactNode} props.children  the result
 */
export default function ReportPageFrame({ report, controls, emptyText, children }) {
  const { metadata, loadError, paramForm, rows, hasRun, loading, runError, clearRunError, handleRun } = report;

  let content;
  if (!hasRun && !loading) {
    content = <Typography color="text.secondary" sx={{ p: 2 }}>اختر المعايير ثم اضغط تنفيذ.</Typography>;
  } else if (hasRun && rows.length === 0 && !loading) {
    content = <Typography color="text.secondary" sx={{ p: 2 }}>{emptyText}</Typography>;
  } else {
    content = children;
  }

  return <Box sx={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
    overflow: 'hidden', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* A link field (e.g. the account) wide enough for a record's name */}
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start',
      '& .MuiAutocomplete-root': { minWidth: 400, maxWidth: '100%' } }}>
      {metadata && <FormFields formFields={paramForm.paramFields} formValues={paramForm.paramValues}
        setFormValues={paramForm.setParamValues} isValid={paramForm.paramValidity}
        setIsValid={paramForm.setParamValidity} tryToSubmit={paramForm.showParamErrors} />}
      <Button variant="contained" onClick={handleRun} disabled={loading || !metadata} sx={{ minWidth: 88, mt: 1 }}>
        {loading ? <CircularProgress size={18} color="inherit" /> : 'تنفيذ'}
      </Button>
      <Box sx={{ flex: 1 }} />
      {controls}
    </Stack>

    {loadError && <Alert severity="error" sx={{ flexShrink: 0 }}>{loadError}</Alert>}
    {runError && <Alert severity="error" onClose={clearRunError} sx={{ flexShrink: 0 }}>{runError}</Alert>}

    <Box sx={{ flex: 1, minHeight: 0, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {content}
    </Box>
  </Box>;
}
