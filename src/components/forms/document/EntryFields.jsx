'use client';

import CheckIcon from '@mui/icons-material/Check';
import { Autocomplete, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Combobox } from '@/components/ui/ComboBox2';
import { normalizeDecimalText } from '@/utils/decimals';
import { formatExpiry, parseExpiry } from '@/utils/expiryDates';
import { COMBOBOX_PROPS } from './comboboxOptions';
import { isUnreadableExpiry } from './entryChecks';
import { formatAmount } from './amounts';

/*
 * The entry row of a document form: the fields of one line, typed in from left to right (Enter moves on), and the OK
 * button that sends the line to the backend.
 */

/** The entry row: its fields in a line, Enter moving from one to the next (see moveOnEnter). */
export function EntryRow({ fieldRefs, children }) {
  return <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexShrink: 0 }}
    onKeyDown={(event) => moveOnEnter(event, fieldRefs)}>
    {children}
  </Stack>;
}

/**
 * For an entry row's onKeyDown: Enter moves to the next of the fields (refs, in order; the last is the OK button,
 * where Enter is a click, which sends the line), skipping disabled ones. Not when ComboBox2 used it to pick from its
 * open list (it prevents the default then), nor in a field not in the list.
 */
export function moveOnEnter(event, fieldRefs) {
  if (event.key !== 'Enter' || event.defaultPrevented) {
    return;
  }
  const index = fieldRefs.findIndex((ref) => ref.current === event.target);
  if (index < 0) {
    return;
  }
  const next = fieldRefs.slice(index + 1).find((ref) => ref.current && !ref.current.disabled);
  if (next) {
    event.preventDefault();
    next.current.focus();
    next.current.select?.();
  }
}

/**
 * The entry row's product, with its error under it. A product's barcode (its option's code) picks it: scanned into
 * the field, Enter then moves on to the next one. A barcode no product has empties the field (the product chosen
 * before, kept after OK, isn't the one scanned) and is shown under it until a product is chosen.
 */
export function ProductField({ productRef, options, value, onChange, error, placeholder = 'اختر الصنف…' }) {
  const [unknownCode, setUnknownCode] = useState(null);

  // A product put in by the form (a line to edit) answers the barcode too
  const [valueShown, setValueShown] = useState(value);
  if (value !== valueShown) {
    setValueShown(value);
    if (value != null) {
      setUnknownCode(null);
    }
  }

  const handleUnknownCode = (code) => {
    if (value != null) {
      onChange(null);
    }
    setUnknownCode(code);
  };
  const handleChange = (next) => {
    setUnknownCode(null);
    onChange(next);
  };

  const shownError = unknownCode != null ? `لا يوجد صنف بالباركود ${unknownCode}` : error;
  return <Box sx={{ flex: 2, minWidth: 170 }}>
    <Combobox {...COMBOBOX_PROPS} ref={productRef} aria-label="الصنف" options={options} value={value}
      placeholder={placeholder} onUnknownCode={handleUnknownCode} onChange={handleChange} />
    {shownError && <Typography variant="caption" color="error"><bdi>{shownError}</bdi></Typography>}
  </Box>;
}

const INPUT_MODES = { numeric: 'numeric', decimal: 'decimal' };

/**
 * A text field of an entry row, typed left to right.
 *
 * @param kind numeric (whole units), decimal (a percent), text, or batch (a batch number: typed in upper case, as
 *             printed on the box and as the backend keeps it)
 */
export function EntryField({
  label, value, onChange, inputRef, error, kind = 'text', placeholder, disabled, minWidth = 90, helperText,
}) {
  const handleChange = (event) => {
    const typed = event.target.value;
    onChange(kind === 'batch' ? typed.toUpperCase() : typed);
  };
  return <TextField size="small" label={label} value={value} placeholder={placeholder} disabled={disabled}
    sx={{ flex: 1, minWidth }} inputRef={inputRef} error={!!error} helperText={error ?? helperText}
    onChange={handleChange}
    slotProps={{
      inputLabel: { shrink: placeholder ? true : undefined },
      htmlInput: { inputMode: INPUT_MODES[kind], dir: 'ltr' },
    }} />;
}

/**
 * An expiry date as it's typed (utils/expiryDates): a month and year ("05/2027") is the month's first day. When it's
 * left, a date it reads is shown in full (01/05/2027), and one it can't read is marked.
 */
export function ExpiryField({ value, onChange, inputRef, error }) {
  const [left, setLeft] = useState(false);
  const unreadable = left && isUnreadableExpiry(value);

  const handleBlur = () => {
    setLeft(true);
    const date = parseExpiry(value);
    if (date) {
      onChange(formatExpiry(date));
    }
  };
  return <TextField size="small" label="الصلاحية" placeholder="شهر/سنة" value={value} sx={{ flex: 1, minWidth: 120 }}
    inputRef={inputRef} error={!!error || unreadable}
    helperText={error ?? (unreadable ? 'تاريخ غير صحيح' : undefined)}
    onChange={(event) => {
      setLeft(false);
      onChange(event.target.value);
    }}
    onBlur={handleBlur}
    slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />;
}

const sameBatch = (a, b) => a.batchNumber === b.batchNumber && a.expiryDate === b.expiryDate;
const batchLabel = (batch) => `${batch.batchNumber} · ${formatExpiry(batch.expiryDate)}`;

/** The batches whose number or expiry date contains what's typed ("2410", "05/2027"). */
function batchesMatching(batches, typed) {
  const text = normalizeDecimalText(typed).toLowerCase();
  if (!text) {
    return batches;
  }
  return batches.filter((batch) => batch.batchNumber.toLowerCase().includes(text)
    || formatExpiry(batch.expiryDate).includes(text)
    || batch.expiryDate.includes(text));
}

/**
 * A batch chosen from a list ({ batchNumber, expiryDate, available }), its number and expiry date as one, found by
 * typing part of either; the list opens when the field is entered. Esc clears the field (the batch chosen and the
 * text typed). A batch the list doesn't have (a line's, being edited) is shown too.
 *
 * @param availableLabel what each batch's available quantity is called in the list
 * @param loadError      why the list couldn't be loaded (SWR's error), shown in the list instead of noOptionsText
 */
export function BatchPicker({
  options, value, onChange, inputRef, error, availableLabel, noOptionsText, loading, loadError,
}) {
  const [inputValue, setInputValue] = useState('');
  const valueIsListed = value && options.some((option) => sameBatch(option, value));
  const allOptions = value && !valueIsListed ? [value, ...options] : options;

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    // Instead of Autocomplete's own Esc (closing the list first): clear the field at once
    event.defaultMuiPrevented = true;
    event.preventDefault();
    event.stopPropagation();
    setInputValue('');
    if (value) {
      onChange(null);
    }
  };

  const renderOption = ({ key, ...props }, batch) => <li key={key} {...props}>
    <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'baseline' }}>
      <bdi style={{ direction: 'ltr' }}>{batch.batchNumber}</bdi>
      <bdi style={{ direction: 'ltr', color: '#5b6876' }}>{formatExpiry(batch.expiryDate)}</bdi>
      <Box sx={{ flex: 1 }} />
      {batch.available != null && <Typography variant="caption" color="text.secondary">
        {availableLabel} {formatAmount(batch.available)}
      </Typography>}
    </Stack>
  </li>;

  return <Autocomplete size="small" sx={{ flex: 2, minWidth: 210 }}
    options={allOptions} value={value} onChange={(event, next) => onChange(next)}
    getOptionLabel={batchLabel} isOptionEqualToValue={sameBatch}
    inputValue={inputValue} onInputChange={(event, next) => setInputValue(next)}
    onKeyDown={handleKeyDown}
    filterOptions={(batches, state) => batchesMatching(batches, state.inputValue)}
    renderOption={renderOption}
    autoHighlight openOnFocus loading={loading} noOptionsText={loadError?.message ?? noOptionsText}
    loadingText="جارٍ التحميل…"
    renderInput={(params) => <TextField {...params} label="التشغيلة والصلاحية"
      placeholder="جزء من التشغيلة أو الصلاحية" inputRef={inputRef} error={!!error} helperText={error} />} />;
}

/**
 * The entry row's OK button: queues the line to be sent, so the next one can be typed at once; "تحديث" when it
 * replaces a line.
 */
export function OkButton({ okRef, onClick, updating }) {
  return <Button ref={okRef} variant="contained" startIcon={<CheckIcon />} onClick={onClick}
    sx={{ flexShrink: 0, height: 40, minWidth: 96 }}>
    {updating ? 'تحديث' : 'OK'}
  </Button>;
}
