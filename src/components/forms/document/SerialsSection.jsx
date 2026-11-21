'use client';

import {
  Alert, Autocomplete, Box, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { formatExpiry } from '@/utils/expiryDates';
import { fetchJson } from '@/utils/fetchJson';
import { GROUP_SEPARATOR, gtinOf, isSeparatorKey, parseDataMatrix, scannedCharacter } from '@/utils/gs1';
import { rowForScan, scannedProduct } from '@/utils/serialScans';
import { formatAmount } from './amounts';
import { useOptions } from './comboboxOptions';
import { EntryRow, OkButton } from './EntryFields';
import { checkExpiry, checkSerialNumber, hasErrors } from './entryChecks';
import { deleteColumn, expiryColumn, LinesGrid, textColumn } from './LinesGrid';

/*
 * The serial numbers of a document's pieces: a piece may carry one. Under a document's rows: batch rows where stock
 * comes in or a line is one batch (a purchase invoice's batches, an opening balance's, a sales return's or a purchase
 * return's lines), or product lines where stock goes out of any batch (a sales invoice's, a stock transfer's), each
 * serial then being of the batch the piece is in. A row takes at most its limit of them; its other units are pieces
 * without a serial.
 *
 * Two ways in, the one chosen remembered by the browser:
 * - by hand: the row, then the serial, typed or scanned. Enter in the serial sends it at once (a scanner ends its code
 *   with Enter), and the row stays chosen with the serial emptied, so the next piece is scanned straight after.
 * - by DataMatrix: a pack's code scanned fills its GTIN, lot, expiry and serial (utils/gs1), finds the row (a product
 *   with that GTIN; for batch rows, the pack's lot and expiry month: utils/serialScans) and sends the serial with the
 *   lot and expiry, for the backend to check against the piece's batch where the row doesn't say it. What doesn't
 *   match stops, its fields kept for correcting and OK; several rows that match are offered to choose from. A
 *   receiving document or a stock count (onScanPiece) takes the pack itself: on its lot's row, made or raised as needed.
 * The backend checks what can't be seen here: a serial already in stock or not in the warehouse, another batch's...
 */

const MODE_KEY = 'serialEntryMode';
const BY_HAND = 'hand';
const BY_SCAN = 'scan';

/** The way in the browser remembers; by hand when it can't say. */
function rememberedMode() {
  try {
    return window.localStorage.getItem(MODE_KEY) === BY_SCAN ? BY_SCAN : BY_HAND;
  } catch {
    return BY_HAND;
  }
}

function rememberMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered: the next document starts by hand
  }
}

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

const EMPTY_PACK = { gtin: '', batchNumber: '', expiry: '' };

/**
 * @param rows     the rows: { rowId, productId, productName, batchNumber and expiryDate (none for a product line),
 *                 quantity, limit (optional: fewer serials than its quantity), serials: [{ id, serialNumber,
 *                 batchNumber, expiryDate }] }
 * @param editable whether serials may be added and deleted (a draft's, at the step it takes them)
 * @param onAdd    (rowId, serialNumber, scanned): sends a serial for the row; scanned, when it came from a DataMatrix,
 *                 is the pack's { batchNumber, expiryDate } (ISO)
 * @param onDelete (serial id): deletes one
 * @param onScanPiece (productId, { batchNumber, expiryDate, serialNumber }): a receiving document's or a count's: sends a scanned
 *                 pack, which goes on its lot's row, made or raised by one as needed; none where rows only take serials
 */
export function SerialsSection({ rows, editable, onAdd, onDelete, onScanPiece }) {
  const [mode, setMode] = useState(rememberedMode);
  const [rowId, setRowId] = useState(null);
  const [serialNumber, setSerialNumber] = useState('');
  // The pack's other fields, scanned or typed: its GTIN, lot and expiry as shown
  const [pack, setPack] = useState(EMPTY_PACK);
  // The rows a scan matched when several did, to choose from
  const [choices, setChoices] = useState(null);
  const [scanMessage, setScanMessage] = useState(null);
  const [errors, setErrors] = useState({});
  const scanRef = useRef(null);
  const rowRef = useRef(null);
  const gtinRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const serialRef = useRef(null);
  const okRef = useRef(null);

  const { options: products } = useOptions('products');
  const { data: scanner } = useSWR(editable ? '/api/settings/scanner' : null, fetchJson);
  const separator = scanner?.groupSeparator ?? null;
  const separatorKey = isSeparatorKey(separator) ? separator : null;

  const serialRows = useMemo(() => rows.flatMap((row) => row.serials.map((serial) => ({
    ...serial, rowId: row.rowId, productId: row.productId, productName: row.productName,
  }))), [rows]);
  // A row deleted meanwhile (with its serials) is no longer chosen
  const chosen = rows.find((row) => row.rowId === rowId) ?? null;
  const byScan = mode === BY_SCAN;

  const changeMode = (event, next) => {
    if (!next) {
      return;
    }
    setMode(next);
    rememberMode(next);
    setErrors({});
    setScanMessage(null);
    setChoices(null);
    // Focused once the mode's fields are shown
    setTimeout(() => (next === BY_SCAN ? scanRef : rowRef).current?.focus(), 0);
  };

  const choose = (row) => {
    setRowId(row?.rowId ?? null);
    setErrors((previous) => ({ ...previous, rowId: null }));
    if (row) {
      (byScan ? okRef : serialRef).current?.focus();
    }
  };

  /** Whether the product's serial is on the document already, on any of its rows. */
  const isOnDocument = (row, serial) => serial != null && row != null && serialRows.some(
    (candidate) => candidate.productId === row.productId && candidate.serialNumber === serial);

  /** Sends the serial; the batch row stays chosen and the serial is emptied for the next piece. */
  const save = () => {
    const serial = checkSerialNumber(serialNumber);
    const nextErrors = {
      rowId: chosen == null ? 'اختر البند' : (isFull(chosen) ? 'سيريالات البند مكتملة' : null),
      serialNumber: serial.error ?? (isOnDocument(chosen, serial.serialNumber) ? 'مُدخل بالفعل' : null),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }
    onAdd(chosen.rowId, serial.serialNumber);
    setSerialNumber('');
    serialRef.current?.focus();
  };

  /**
   * Sends a pack's serial (scanned, or its fields corrected and OK pressed) for its row: the one chosen from the rows
   * a scan matched, else the one its GTIN, lot and expiry match. What doesn't stops with its reason.
   */
  const savePack = ({ gtin, batchNumber, expiryDate, serialNumber: typed }, chosenRow) => {
    const serial = checkSerialNumber(typed ?? '');
    const gtin14 = gtinOf(gtin);
    const productIds = products.filter((product) => product.gtin === gtin14).map((product) => product.value);
    const nextErrors = {
      gtin: gtin14 == null ? 'GTIN غير صحيح' : (productIds.length === 0 ? 'لا يوجد صنف بهذا الـ GTIN' : null),
      serialNumber: serial.error ?? null,
    };
    setErrors(nextErrors);
    setScanMessage(null);
    if (hasErrors(nextErrors)) {
      return;
    }
    if (onScanPiece && !chosenRow) {
      sendPiece(productIds, { batchNumber, expiryDate, serialNumber: serial.serialNumber });
      return;
    }
    const match = chosenRow ? { row: chosenRow } : rowForScan(rows, productIds, { batchNumber, expiryDate }, isFull);
    if (match.error) {
      setScanMessage(match.error);
      return;
    }
    if (match.rows) {
      setChoices(match.rows);
      setRowId(null);
      setScanMessage('أكثر من بند يطابق العبوة: اختر البند ثم OK');
      rowRef.current?.focus();
      return;
    }
    if (isOnDocument(match.row, serial.serialNumber)) {
      setErrors({ serialNumber: 'مُدخل بالفعل' });
      return;
    }
    onAdd(match.row.rowId, serial.serialNumber, { batchNumber: batchNumber || null, expiryDate: expiryDate || null });
    setRowId(match.row.rowId);
    setChoices(null);
    scanRef.current?.focus();
  };

  /** A receiving document's or a count's pack: sent for its product, which goes on its lot's row (made or raised as needed). */
  const sendPiece = (productIds, piece) => {
    const product = scannedProduct(rows, productIds);
    if (product.error) {
      setScanMessage(product.error);
      return;
    }
    if (!piece.batchNumber || !piece.expiryDate) {
      setScanMessage('العبوة لا تحمل تشغيلتها (10) وصلاحيتها (17): أدخلهما ثم OK');
      return;
    }
    if (isOnDocument({ productId: product.productId }, piece.serialNumber)) {
      setErrors({ serialNumber: 'مُدخل بالفعل' });
      return;
    }
    onScanPiece(product.productId, piece);
    setChoices(null);
    scanRef.current?.focus();
  };

  /**
   * A scanned code: its fields shown, then its serial sent. The scan field is emptied for the next code either way; one
   * that can't be read is quoted in the message, its separators shown as ␝ (for checking the scanner's setting).
   */
  const readScan = () => {
    const scanned = scanRef.current?.value ?? '';
    scanRef.current.value = '';
    const parsed = parseDataMatrix(scanned, separatorKey ? null : separator);
    setChoices(null);
    setRowId(null);
    if (parsed.error) {
      setScanMessage(`${parsed.error} — الكود: ${scanned.replaceAll(GROUP_SEPARATOR, '␝')}`);
      return;
    }
    setPack({ gtin: parsed.gtin ?? '', batchNumber: parsed.batchNumber ?? '', expiry: formatExpiry(parsed.expiryDate) });
    setSerialNumber(parsed.serialNumber ?? '');
    savePack(parsed, null);
  };

  /** OK by DataMatrix: the fields as they are now, corrected or typed, for the row chosen or the one they match. */
  const savePackFields = () => {
    const expiry = pack.expiry.trim() === '' ? { date: null } : checkExpiry(pack.expiry);
    if (expiry.error) {
      setErrors({ expiry: expiry.error });
      return;
    }
    savePack({ gtin: pack.gtin, batchNumber: pack.batchNumber.trim(), expiryDate: expiry.date, serialNumber },
      choices && chosen && choices.includes(chosen) ? chosen : null);
  };

  /**
   * The scan field types each key by its physical key (a scanner's code in an Arabic layout stays Latin), the
   * settings' separator key as GS; Enter reads the code. Written straight into the field, as a scanner types faster
   * than the page redraws.
   */
  const handleScanKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      readScan();
      return;
    }
    const character = scannedCharacter(event, separatorKey);
    if (character !== null) {
      event.preventDefault();
      const input = event.target;
      input.setRangeText(character, input.selectionStart, input.selectionEnd, 'end');
    }
  };

  /** Enter sends the serial at once, rather than moving on to OK: a scanner ends its code with it. */
  const handleSerialKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (byScan) {
        savePackFields();
      } else {
        save();
      }
    }
  };

  const packField = (name, label, ref, sx) => <TextField size="small" label={label} value={pack[name]} sx={sx}
    inputRef={ref} error={!!errors[name]} helperText={errors[name]}
    onChange={(event) => {
      setPack((previous) => ({ ...previous, [name]: event.target.value }));
      setErrors((previous) => ({ ...previous, [name]: null }));
    }}
    slotProps={{ htmlInput: { dir: 'ltr' } }} />;

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

  const rowField = <Autocomplete size="small" sx={{ flex: 3, minWidth: 260 }}
    options={byScan && choices ? choices : rows} value={chosen}
    onChange={(event, row) => choose(row)} getOptionLabel={rowLabel}
    isOptionEqualToValue={(option, value) => option.rowId === value.rowId} renderOption={renderOption}
    autoHighlight openOnFocus noOptionsText="لا توجد بنود في المستند"
    renderInput={(params) => <TextField {...params} label="البند" placeholder="صنف أو تشغيلة…"
      inputRef={rowRef} error={!!errors.rowId} helperText={errors.rowId ?? (chosen
        ? `${formatAmount(String(chosen.serials.length))} من ${formatAmount(limitOf(chosen))} بسيريال`
        : undefined)} />} />;

  const serialField = <TextField size="small" label="السيريال" value={serialNumber} sx={{ flex: 2, minWidth: 160 }}
    inputRef={serialRef} error={!!errors.serialNumber} helperText={errors.serialNumber}
    onChange={(event) => {
      setSerialNumber(event.target.value);
      setErrors((previous) => ({ ...previous, serialNumber: null }));
    }}
    onKeyDown={handleSerialKeyDown} slotProps={{ htmlInput: { dir: 'ltr' } }} />;

  if (!editable && serialRows.length === 0) {
    return null;
  }
  return <>
    <Stack direction="row" spacing={2} sx={{ flexShrink: 0, alignItems: 'center' }}>
      <Typography variant="subtitle2">السيريالات</Typography>
      {editable && <ToggleButtonGroup size="small" exclusive value={mode} onChange={changeMode}>
        <ToggleButton value={BY_HAND} sx={{ py: 0.25 }}>إدخال يدوي</ToggleButton>
        <ToggleButton value={BY_SCAN} sx={{ py: 0.25 }}>مسح DataMatrix</ToggleButton>
      </ToggleButtonGroup>}
    </Stack>
    {editable && !byScan && <EntryRow fieldRefs={[rowRef, serialRef, okRef]}>
      {rowField}
      {serialField}
      <OkButton okRef={okRef} onClick={save} updating={false} />
    </EntryRow>}
    {editable && byScan && <>
      <TextField size="small" label="امسح كود العبوة (DataMatrix)" sx={{ flexShrink: 0 }} autoFocus
        inputRef={scanRef} onKeyDown={handleScanKeyDown}
        helperText={separator ? `فاصل المجموعات في الماسح: ${separator}` : 'الماسح يكتب فاصل المجموعات بنفسه'}
        // Its text is written straight into it, which the label wouldn't notice: always above
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr', autoComplete: 'off' } }} />
      <EntryRow fieldRefs={[rowRef, gtinRef, batchRef, expiryRef, serialRef, okRef]}>
        {rowField}
        {packField('gtin', 'GTIN', gtinRef, { flex: 2, minWidth: 150 })}
        {packField('batchNumber', 'التشغيلة', batchRef, { flex: 1, minWidth: 100 })}
        {packField('expiry', 'الصلاحية', expiryRef, { width: 120 })}
        {serialField}
        <OkButton okRef={okRef} onClick={savePackFields} updating={false} />
      </EntryRow>
      {scanMessage && <Alert severity="warning" sx={{ flexShrink: 0, py: 0 }}
        onClose={() => setScanMessage(null)}>{scanMessage}</Alert>}
    </>}
    <LinesGrid rows={serialRows} columnDefs={serialColumns({ readOnly: !editable, onDelete: (row) => onDelete(row.id) })}
      readOnly={!editable} onEdit={(row) => choose(rows.find((candidate) => candidate.rowId === row.rowId))}
      minHeight={100}
      emptyText={rows.length === 0 && !(byScan && onScanPiece)
        ? 'السيريالات تُدخل لبنود المستند: أدخل البنود أولاً ثم سيريالات قطعها'
        : (byScan ? 'امسح كود DataMatrix لكل عبوة: يُضاف سيريالها إلى بندها مباشرة'
          : 'اختر البند ثم أدخل سيريال كل قطعة لها سيريال؛ Enter يحفظ ويستعد للقطعة التالية')} />
  </>;
}
