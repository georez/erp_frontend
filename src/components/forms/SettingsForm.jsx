'use client';

import { Alert, Container, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack } from '@mui/material';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

const SETTINGS_URL = '/api/settings';

// Which batches a sale's line that names none takes first (the backend's BatchOrder)
const SALES_BATCH_ORDERS = [
  { value: 'FEFO', label: 'الأقرب انتهاءً أولاً (FEFO)' },
  { value: 'LIFO', label: 'آخر وارد أولاً (LIFO)' },
];

/**
 * The tenant's settings (/api/settings). A choice is saved as soon as it's made; the form then shows the settings as
 * the backend has them.
 */
export default function SettingsForm() {
  const { csrfFetch } = useContext(AuthContext);
  const { data: settings, error: loadError, mutate } = useSWR(SETTINGS_URL, fetchJson,
    { revalidateOnFocus: false });
  const [errorMessage, setErrorMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (changes) => {
    setErrorMessage(null);
    setSaving(true);
    try {
      const response = await sendOrShowError(() => csrfFetch(SETTINGS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...changes }),
      }), setErrorMessage);
      if (!response) {
        return;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response));
        return;
      }
      await mutate(await response.json(), { revalidate: false });
    } finally {
      setSaving(false);
    }
  };

  return <Container maxWidth="sm">
    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {settings && <Stack spacing={2} sx={{ p: 1 }}>
      <FormControl disabled={saving}>
        <FormLabel id="sales-batch-order">ترتيب سحب التشغيلات في المبيعات</FormLabel>
        <RadioGroup aria-labelledby="sales-batch-order" value={settings.salesBatchOrder}
          onChange={(event) => save({ salesBatchOrder: event.target.value })}>
          {SALES_BATCH_ORDERS.map(({ value, label }) =>
            <FormControlLabel key={value} value={value} control={<Radio />} label={label} />)}
        </RadioGroup>
      </FormControl>
    </Stack>}
  </Container>;
}
