'use client';

import {
  Alert, Box, Button, Container, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField,
} from '@mui/material';
import useSWR from 'swr';
import { useContext, useRef, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { errorMessageFromBody } from '@/utils/errorMessages';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

const SETTINGS_URL = '/api/settings';
const LOGO_URL = '/api/settings/logo';
// The backend's TenantSettingsService.MAX_LOGO_BYTES
const MAX_LOGO_KILOBYTES = 512;

// Which batches a sale's line that names none takes first (the backend's BatchOrder)
const SALES_BATCH_ORDERS = [
  { value: 'FEFO', label: 'الأقرب انتهاءً أولاً (FEFO)' },
  { value: 'LIFO', label: 'آخر وارد أولاً (LIFO)' },
];

// The company's details printed documents show at the top, with their longest texts (the backend's V7); numbers are
// typed left to right
const COMPANY_FIELDS = [
  { name: 'companyName', label: 'اسم الشركة', maxLength: 200 },
  { name: 'companyAddress', label: 'العنوان', maxLength: 300, multiline: true },
  { name: 'companyPhones', label: 'الهواتف', maxLength: 100, dir: 'ltr' },
  { name: 'companyTaxRegistrationNo', label: 'رقم التسجيل الضريبي', maxLength: 30, dir: 'ltr' },
  { name: 'companyCommercialRegisterNo', label: 'رقم السجل التجاري', maxLength: 30, dir: 'ltr' },
];

/**
 * The tenant's settings (/api/settings). A choice is saved as soon as it's made, a text when the cursor leaves it, and
 * the logo when its file is chosen; the form then shows the settings as the backend has them.
 */
export default function SettingsForm() {
  const { csrfFetch } = useContext(AuthContext);
  const { data: settings, error: loadError, mutate } = useSWR(SETTINGS_URL, fetchJson,
    { revalidateOnFocus: false });
  const [errorMessage, setErrorMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  // The texts typed and not saved yet, by field. Every save sends them all, so two saves close together can't undo
  // each other.
  const [edits, setEdits] = useState({});
  // Changed after each logo change, so the browser shows the new logo rather than the one it has
  const [logoVersion, setLogoVersion] = useState(0);
  const logoInput = useRef(null);

  /** Sends a request whose answer is the settings, and shows them; false when it's refused or fails. */
  const send = async (url, options) => {
    setErrorMessage(null);
    setSaving(true);
    try {
      const response = await sendOrShowError(() => csrfFetch(url, options), setErrorMessage);
      if (!response) {
        return false;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response));
        return false;
      }
      await mutate(await response.json(), { revalidate: false });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async (changes) => {
    const sent = { ...edits, ...changes };
    const saved = await send(SETTINGS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, ...sent }),
    });
    if (saved) {
      // Texts typed again while it was sent stay unsaved
      setEdits((current) => Object.fromEntries(Object.entries(current)
        .filter(([name, value]) => value !== sent[name])));
    }
  };

  const saveText = (name) => {
    if (name in edits && edits[name] !== (settings[name] ?? '')) {
      save({});
    }
  };

  const uploadLogo = async (file) => {
    // Checked here too: a file much larger than a logo may be cut off on its way to the backend (a connection
    // error), before the backend could say why
    if (file.size > MAX_LOGO_KILOBYTES * 1024) {
      setErrorMessage(errorMessageFromBody({
        errorCode: 'LOGO_TOO_LARGE', errorParams: { maxKilobytes: MAX_LOGO_KILOBYTES },
      }));
      return;
    }
    if (await send(LOGO_URL, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })) {
      setLogoVersion((version) => version + 1);
    }
  };

  const removeLogo = async () => {
    if (await send(LOGO_URL, { method: 'DELETE' })) {
      setLogoVersion((version) => version + 1);
    }
  };

  return <Container maxWidth="sm">
    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {settings && <Stack spacing={3} sx={{ p: 1 }}>
      <FormControl disabled={saving}>
        <FormLabel id="sales-batch-order">ترتيب سحب التشغيلات في المبيعات</FormLabel>
        <RadioGroup aria-labelledby="sales-batch-order" value={settings.salesBatchOrder}
          onChange={(event) => save({ salesBatchOrder: event.target.value })}>
          {SALES_BATCH_ORDERS.map(({ value, label }) =>
            <FormControlLabel key={value} value={value} control={<Radio />} label={label} />)}
        </RadioGroup>
      </FormControl>

      <Stack spacing={1.5} component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
        <FormLabel component="legend" sx={{ mb: 1.5 }}>بيانات الشركة في المطبوعات</FormLabel>
        {COMPANY_FIELDS.map(({ name, label, maxLength, multiline, dir }) =>
          <TextField key={name} label={label} size="small" multiline={multiline} minRows={multiline ? 2 : undefined}
            value={edits[name] ?? settings[name] ?? ''}
            onChange={(event) => setEdits((current) => ({ ...current, [name]: event.target.value }))}
            onBlur={() => saveText(name)}
            slotProps={{ htmlInput: { maxLength, dir } }} />)}

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{
            width: 160, height: 80, border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 14,
          }}>
            {settings.hasLogo
              // eslint-disable-next-line @next/next/no-img-element -- the backend's image, not a static one
              ? <img src={`${LOGO_URL}?v=${logoVersion}`} alt="شعار الشركة"
                style={{ maxWidth: '100%', maxHeight: '100%' }} />
              : 'لا يوجد شعار'}
          </Box>
          <Button variant="outlined" size="small" disabled={saving} onClick={() => logoInput.current?.click()}>
            {settings.hasLogo ? 'تغيير الشعار' : 'اختيار شعار'}
          </Button>
          {settings.hasLogo &&
            <Button color="error" size="small" disabled={saving} onClick={removeLogo}>حذف الشعار</Button>}
          <input ref={logoInput} type="file" accept="image/png,image/jpeg" hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared, so choosing the same file again is a change too
              event.target.value = '';
              if (file) {
                uploadLogo(file);
              }
            }} />
        </Stack>
        <FormLabel sx={{ fontSize: 13 }}>صورة PNG أو JPEG، حتى 512 كيلوبايت</FormLabel>
      </Stack>
    </Stack>}
  </Container>;
}
