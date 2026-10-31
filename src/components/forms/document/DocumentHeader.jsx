'use client';

import { Box, Chip, Stack, TextField, Typography } from '@mui/material';
import { Combobox } from '@/components/ui/ComboBox2';
import { COMBOBOX_PROPS } from './comboboxOptions';
import { MAX_DESCRIPTION_LENGTH } from './entryChecks';

/*
 * A document's header: its title and status, then its fields. A field is saved when it's left (onBlur), on a draft;
 * a choice (a combobox) is saved when it's chosen.
 */

/** The header's row: on one line where it fits. */
export function HeaderRow({ wrap = false, children }) {
  return <Stack direction="row" spacing={1.5} useFlexGap
    sx={{ alignItems: 'center', flexShrink: 0, ...(wrap && { flexWrap: 'wrap' }) }}>
    {children}
  </Stack>;
}

/** The document's title and its status (see documentStatus). */
export function DocumentTitle({ title, status }) {
  return <>
    <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</Typography>
    <Chip size="small" label={status.label} color={status.color} sx={{ flexShrink: 0 }} />
  </>;
}

/**
 * The status chip of a document: new, draft, or posted with its journal entry.
 *
 * @param newLabel    "new" in the document's gender (جديد / جديدة)
 * @param postedLabel "posted" in the document's gender (مُرحَّل / مُرحَّلة)
 */
export function documentStatus(document, { newLabel, postedLabel }) {
  if (!document) {
    return { label: newLabel, color: 'default' };
  }
  if (document.status === 'POSTED') {
    return { label: `${postedLabel} · قيد ${document.journalEntryId}`, color: 'success' };
  }
  return { label: 'مسودة', color: 'warning' };
}

/** A label and its field side by side, so the header stays one line high; basis: its share of the line. */
export function Labelled({ id, label, basis, children }) {
  return <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flex: `1 1 ${basis}px`, minWidth: 0 }}>
    <Typography component="label" id={id} variant="body2" sx={{ whiteSpace: 'nowrap' }}>{label}</Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Stack>;
}

/** A combobox in the header, beside its label. Clearing it changes nothing: a header field is always chosen. */
export function HeaderCombobox({ id, label, basis, options, value, disabled, placeholder = 'اختر…', onChange }) {
  const changeUnlessCleared = (next) => {
    if (next != null) {
      onChange(next);
    }
  };
  return <Labelled id={id} label={label} basis={basis}>
    <Combobox {...COMBOBOX_PROPS} aria-labelledby={id} options={options} value={value} disabled={disabled}
      placeholder={placeholder} onChange={changeUnlessCleared} />
  </Labelled>;
}

/** The header's description: saved when it's left. */
export function DescriptionField({ value, disabled, onChange, onBlur }) {
  return <TextField size="small" placeholder="البيان" value={value} disabled={disabled}
    sx={{ flex: '1 1 160px', minWidth: 0 }} error={value.length > MAX_DESCRIPTION_LENGTH}
    slotProps={{ htmlInput: { 'aria-label': 'البيان' } }}
    onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />;
}
