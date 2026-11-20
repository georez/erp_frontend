'use client';

import { Autocomplete, Box, Stack, TextField, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount } from './amounts';
import { EntryRow, OkButton } from './EntryFields';
import { checkSerialNumber, hasErrors } from './entryChecks';
import { deleteColumn, expiryColumn, LinesGrid, textColumn } from './LinesGrid';

/*
 * The serial numbers of a document's pieces: a piece may carry one. Under a document's rows: batch rows where stock
 * comes in or a line is one batch (a purchase invoice's batches, an opening balance's, a sales return's or a purchase
 * return's lines), or product lines where stock goes out of any batch (a sales invoice's, a stock transfer's), each
 * serial then being of the batch the piece is in. A row takes at most its limit of them; its other units are pieces
 * without a serial.
 *
 * The entry row: the row, then the serial, typed or scanned. Enter in the serial sends it at once (a scanner ends its
 * code with Enter), and the row stays chosen with the serial emptied, so the next piece is scanned straight after. The
 * backend checks what can't be seen here: a serial already in stock or not in the warehouse, another batch's...
 */

const rowLabel = (row) => (row.batchNumber
  ? `${row.productName} · ${row.batchNumber} · ${formatExpiry(row.expiryDate)}`
  : row.productName);

/** How many serials the row takes: its limit, else its quantity. */
const limitOf = (row) => row.limit ?? row.quantity;

/** Whether the row has as many serials as it takes. */
const isFull = (row) => Big(row.serials.length).compareTo(Big(limitOf(row))) >= 0;

const serialColumns = ({ readOnly, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  textColumn('serialNumber', 'السيريال', { flex: 2, minWidth: 140 }),
  ...deleteColumn(readOnly, onDelete, (row) => `${row.productName} ${row.serialNumber}`),
];

/**
 * @param rows     the rows: { rowId, productId, productName, batchNumber and expiryDate (none for a product line),
 *                 quantity, limit (optional: fewer serials than its quantity), serials: [{ id, serialNumber,
 *                 batchNumber, expiryDate }] }
 * @param editable whether serials may be added and deleted (a draft's, at the step it takes them)
 * @param onAdd    (rowId, serialNumber): sends a serial for the row
 * @param onDelete (serial id): deletes one
 */
export function SerialsSection({ rows, editable, onAdd, onDelete }) {
  const [rowId, setRowId] = useState(null);
  const [serialNumber, setSerialNumber] = useState('');
  const [errors, setErrors] = useState({});
  const rowRef = useRef(null);
  const serialRef = useRef(null);
  const okRef = useRef(null);

  const serialRows = useMemo(() => rows.flatMap((row) => row.serials.map((serial) => ({
    ...serial, rowId: row.rowId, productId: row.productId, productName: row.productName,
  }))), [rows]);
  // A row deleted meanwhile (with its serials) is no longer chosen
  const chosen = rows.find((row) => row.rowId === rowId) ?? null;

  const choose = (row) => {
    setRowId(row?.rowId ?? null);
    setErrors((previous) => ({ ...previous, rowId: null }));
    if (row) {
      serialRef.current?.focus();
    }
  };

  /** Sends the serial; the batch row stays chosen and the serial is emptied for the next piece. */
  const save = () => {
    const serial = checkSerialNumber(serialNumber);
    const onDocument = serial.serialNumber != null && chosen != null && serialRows.some(
      (row) => row.productId === chosen.productId && row.serialNumber === serial.serialNumber);
    const nextErrors = {
      rowId: chosen == null ? 'اختر البند' : (isFull(chosen) ? 'سيريالات البند مكتملة' : null),
      serialNumber: serial.error ?? (onDocument ? 'مُدخل بالفعل' : null),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }
    onAdd(chosen.rowId, serial.serialNumber);
    setSerialNumber('');
    serialRef.current?.focus();
  };

  /** Enter sends the serial at once, rather than moving on to OK: a scanner ends its code with it. */
  const handleSerialKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  };

  const renderOption = ({ key, ...props }, row) => <li key={key} {...props}>
    <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'baseline' }}>
      <span>{row.productName}</span>
      {row.batchNumber && <bdi style={{ direction: 'ltr', color: '#5b6876' }}>
        {row.batchNumber} · {formatExpiry(row.expiryDate)}
      </bdi>}
      <Box sx={{ flex: 1 }} />
      <Typography variant="caption" color={isFull(row) ? 'success.main' : 'text.secondary'}>
        {formatAmount(String(row.serials.length))} / {formatAmount(limitOf(row))}
      </Typography>
    </Stack>
  </li>;

  if (!editable && serialRows.length === 0) {
    return null;
  }
  return <>
    <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>السيريالات</Typography>
    {editable && <EntryRow fieldRefs={[rowRef, serialRef, okRef]}>
      <Autocomplete size="small" sx={{ flex: 3, minWidth: 260 }} options={rows} value={chosen}
        onChange={(event, row) => choose(row)} getOptionLabel={rowLabel}
        isOptionEqualToValue={(option, value) => option.rowId === value.rowId} renderOption={renderOption}
        autoHighlight openOnFocus noOptionsText="لا توجد بنود في المستند"
        renderInput={(params) => <TextField {...params} label="البند" placeholder="صنف أو تشغيلة…"
          inputRef={rowRef} error={!!errors.rowId} helperText={errors.rowId ?? (chosen
            ? `${formatAmount(String(chosen.serials.length))} من ${formatAmount(limitOf(chosen))} بسيريال`
            : undefined)} />} />
      <TextField size="small" label="السيريال" value={serialNumber} sx={{ flex: 2, minWidth: 160 }}
        inputRef={serialRef} error={!!errors.serialNumber} helperText={errors.serialNumber}
        onChange={(event) => {
          setSerialNumber(event.target.value);
          setErrors((previous) => ({ ...previous, serialNumber: null }));
        }}
        onKeyDown={handleSerialKeyDown} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <OkButton okRef={okRef} onClick={save} updating={false} />
    </EntryRow>}
    <LinesGrid rows={serialRows} columnDefs={serialColumns({ readOnly: !editable, onDelete: (row) => onDelete(row.id) })}
      readOnly={!editable} onEdit={(row) => choose(rows.find((candidate) => candidate.rowId === row.rowId))}
      minHeight={100}
      emptyText="اختر البند ثم أدخل سيريال كل قطعة لها سيريال؛ Enter يحفظ ويستعد للقطعة التالية" />
  </>;
}
