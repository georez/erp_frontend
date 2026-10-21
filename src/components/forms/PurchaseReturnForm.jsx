'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SendIcon from '@mui/icons-material/Send';
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useContext, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Combobox } from '@/components/ui/ComboBox2';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson } from '@/utils/fetchJson';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import {
  COMBOBOX_MESSAGES, formatAmount, Labelled, MAX_BATCH_NUMBER_LENGTH, MAX_DESCRIPTION_LENGTH, moveOnEnter,
  NUMBER_CELL, useDocumentRequests, useOptions,
} from './documentForm';

const modules = [AllCommunityModule];
const API = '/api/purchase-returns';
const EMPTY_HEADER = { supplierId: null, warehouseId: null, purchaseInvoiceId: '', description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', quantity: '', discountPercent: '' };
// A line without a batch: the goods come out of the earliest expiring batches first
const EARLIEST_EXPIRY_LABEL = 'الأقدم صلاحية';

/** One of the totals under the grid: its label and its amount. */
function Total({ label, value, strong }) {
  return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 700 : 400, ...NUMBER_CELL }}>
      <bdi>{value == null ? '—' : formatAmount(value)}</bdi>
    </Typography>
  </Stack>;
}

/**
 * The purchase return document: stock sent back to a supplier. A draft is filled one line at a time: a product, its
 * batch (or none: the earliest expiring first) with its expiry date when its number has several, the quantity and a
 * discount. Against a purchase invoice, each unit is
 * credited at what it cost on the invoice (its bonus spread over all its units), the discount field is off, the batch
 * defaults to the invoice's, and a line that came with a bonus goes back whole. Posting takes
 * the goods out of stock at the average cost, debits the supplier with the total (rounded to 2 decimals), and puts the
 * difference between what the supplier credits and what the goods cost on purchase price differences.
 */
export default function PurchaseReturnForm({ formId, formTitle, returnId }) {
  const { csrfFetch } = useContext(AuthContext);
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');

  const { data: purchaseReturn, error: loadError, mutate } = useSWR(
    returnId ? `${API}/${returnId}` : null, fetchJson, { revalidateOnFocus: false });

  // The header: for a new return, what's entered; for a draft, what it has (reset whenever it's loaded again).
  // Set during render, not in an effect, so the stale header is never shown:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [headerLoadedFrom, setHeaderLoadedFrom] = useState(null);
  if (purchaseReturn && purchaseReturn !== headerLoadedFrom) {
    setHeaderLoadedFrom(purchaseReturn);
    setHeader({
      supplierId: purchaseReturn.supplierId,
      warehouseId: purchaseReturn.warehouseId,
      purchaseInvoiceId: purchaseReturn.purchaseInvoiceId == null ? '' : String(purchaseReturn.purchaseInvoiceId),
      description: purchaseReturn.description ?? '',
    });
  }

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const { send, busy, errorMessage, setErrorMessage } = useDocumentRequests(csrfFetch);
  const productRef = useRef(null);
  const expiryRef = useRef(null);
  const batchRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const posted = purchaseReturn?.status === 'POSTED';
  const lines = useMemo(() => purchaseReturn?.lines ?? [], [purchaseReturn]);
  const optionsError = suppliers.error ?? warehouses.error ?? products.error;
  const invoiceIdText = header.purchaseInvoiceId.trim();
  const invoiceIdValid = invoiceIdText === '' || parseWholeUnits(invoiceIdText) != null;

  /** Shows the return a request answered with, or loads it again if the request failed. */
  const show = (saved) => mutate(saved ?? undefined, { revalidate: !saved });

  const headerBody = (changes = {}) => {
    const next = { ...header, ...changes };
    const invoiceId = next.purchaseInvoiceId.trim();
    return {
      supplierId: next.supplierId,
      warehouseId: next.warehouseId,
      purchaseInvoiceId: invoiceId === '' ? null : parseWholeUnits(invoiceId),
      description: next.description.trim() || null,
    };
  };

  /** A header change: kept until the draft exists, saved at once on a draft (the texts when they're left). */
  const changeHeader = async (changes, save = true) => {
    setHeader((previous) => ({ ...previous, ...changes }));
    if (save && purchaseReturn && !posted) {
      await show(await send(`${API}/${purchaseReturn.id}`, 'PUT', headerBody(changes)));
    }
  };

  const saveTextOnBlur = (field, stored) => () => {
    if (purchaseReturn && (stored ?? '') !== header[field].trim() && (field !== 'purchaseInvoiceId' || invoiceIdValid)) {
      changeHeader({});
    }
  };

  const saveEntry = async () => {
    const quantity = parseWholeUnits(entry.quantity);
    // Against an invoice the units are credited at what they cost on it: no discount
    const discountEntered = !invoiceIdText && entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      header: header.supplierId == null ? 'حدّد المورد أولاً'
        : header.warehouseId == null ? 'حدّد المخزن أولاً'
          : !invoiceIdValid ? 'رقم فاتورة المشتريات غير صحيح' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: entry.batchNumber.trim().length > MAX_BATCH_NUMBER_LENGTH
        ? `الحد الأقصى ${MAX_BATCH_NUMBER_LENGTH} حرف` : null,
      expiryDate: entry.expiryDate && !entry.batchNumber.trim() ? 'أدخل التشغيلة' : null,
      quantity: quantity != null && Big(quantity).signum() > 0 ? null : 'عدد صحيح أكبر من صفر',
      discountPercent: discountEntered && !discount ? 'من 0 إلى 100، حتى 3 أرقام عشرية' : null,
    };
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }

    let id = purchaseReturn?.id;
    if (!id) {
      const created = await send(API, 'POST', headerBody());
      if (!created) {
        return;
      }
      id = created.id;
    }
    // As text, so no number passes through a JavaScript number
    const saved = await send(`${API}/${id}/lines`, 'PUT', {
      productId: entry.productId,
      batchNumber: entry.batchNumber.trim() || null,
      expiryDate: entry.expiryDate || null,
      quantity,
      discountPercent: discountEntered ? normalizeDecimalText(entry.discountPercent) : null,
    });
    if (purchaseReturn) {
      await show(saved);
    } else {
      // From now on the window opens this draft (and loads it, with the line if it was saved)
      updateOpenFormUrl(`/dashboard/purchase-return?formTitle=${encodeURIComponent(formTitle)
        }&returnId=${encodeURIComponent(id)}`);
    }
    if (saved) {
      // The product stays selected; the cursor goes back to it, where Enter moves on and typing picks another
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const deleteLine = async (lineId) => {
    await show(await send(`${API}/${purchaseReturn.id}/lines/${lineId}`, 'DELETE'));
  };

  const post = async () => {
    await show(await send(`${API}/${purchaseReturn.id}/post`, 'POST'));
  };

  const openNew = () => {
    updateOpenFormUrl(`/dashboard/purchase-return?formTitle=${encodeURIComponent(formTitle)}`);
    // headerLoadedFrom stays the document just left: until the URL has changed, it's still the one loaded, and
    // forgetting it would load its header back over the cleared one
    setHeader((previous) => ({ ...previous, purchaseInvoiceId: '', description: '' }));
    setEntry(EMPTY_ENTRY);
    setEntryErrors({});
    setErrorMessage(null);
  };

  const deleteDraft = async () => {
    if (!window.confirm(`حذف مسودة مرتجع المشتريات رقم ${purchaseReturn.id}؟`)) {
      return;
    }
    if (await send(`${API}/${purchaseReturn.id}`, 'DELETE')) {
      openNew();
    }
  };

  // Enter moves product → batch → expiry → quantity → discount → OK, and Enter on OK sends the line
  const onEntryKeyDown = (event) => moveOnEnter(event,
    [productRef, batchRef, expiryRef, quantityRef, discountRef, okRef]);

  /** A grid row into the entry row, to change it; OK then replaces the line. */
  const editLine = (line) => {
    // Rendered at once (the grid calls this from its own listener), so the quantity is in its field before it's
    // selected, and typing replaces it
    flushSync(() => {
      setEntry({
        productId: line.productId, batchNumber: line.batchNumber ?? '', expiryDate: line.expiryDate ?? '',
        quantity: line.quantity,
        discountPercent: line.discountPercent,
      });
      setEntryErrors({});
    });
    quantityRef.current?.focus();
    quantityRef.current?.select();
  };
  const editingExistingLine = entry.productId != null && lines.some((line) => line.productId === entry.productId
    && (line.batchNumber ?? '') === entry.batchNumber.trim()
    && (!entry.expiryDate || line.expiryDate === entry.expiryDate));

  const amountColumn = (field, headerName, minWidth = 90) => ({
    field, headerName, flex: 1, minWidth, valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
  });

  // Rebuilt every render: the delete buttons need the current return and busy state
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    {
      field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110,
      valueFormatter: ({ value }) => value ?? EARLIEST_EXPIRY_LABEL,
    },
    { field: 'expiryDate', headerName: 'الصلاحية', flex: 1, minWidth: 110, cellStyle: NUMBER_CELL },
    amountColumn('quantity', 'الكمية', 85),
    amountColumn('publicPrice', 'السعر', 85),
    amountColumn('discountPercent', 'الخصم %', 90),
    amountColumn('netAmount', 'الصافي', 95),
    amountColumn('vatPercent', 'الضريبة %', 100),
    amountColumn('vatAmount', 'الضريبة', 85),
    {
      ...amountColumn('stockValue', 'تكلفة البضاعة', 100),
      // Goods that aren't in stock: posting refuses the return
      valueFormatter: ({ value }) => (value == null ? 'غير متوفر' : formatAmount(value)),
      cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? '#c62828' : 'inherit' }),
    },
    ...(posted ? [] : [{
      headerName: '', colId: 'delete', width: 56, resizable: false,
      cellRenderer: ({ data }) => <IconButton size="small" aria-label={`حذف ${data.productName}`} disabled={busy}
        onClick={() => deleteLine(data.id)}>
        <DeleteIcon fontSize="small" />
      </IconButton>,
    }]),
  ];

  const comboboxProps = { fullWidth: true, messages: COMBOBOX_MESSAGES };
  const status = !purchaseReturn ? { label: 'جديد', color: 'default' }
    : posted ? { label: `مُرحَّل · قيد ${purchaseReturn.journalEntryId}`, color: 'success' }
      : { label: 'مسودة', color: 'warning' };
  const entryField = (field, ref, label, props = {}) => <TextField size="small" label={label} value={entry[field]}
    onChange={(event) => setEntry((previous) => ({ ...previous, [field]: event.target.value }))}
    inputRef={ref} error={!!entryErrors[field]} helperText={entryErrors[field]} sx={{ flex: 1, minWidth: 100 }}
    {...props} />;

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {purchaseReturn ? `مرتجع مشتريات رقم ${purchaseReturn.id}` : 'مرتجع مشتريات جديد'}
      </Typography>
      <Chip size="small" label={status.label} color={status.color} sx={{ flexShrink: 0 }} />
      <Labelled id={`${formId}-supplier`} label="المورد" basis={220}>
        <Combobox {...comboboxProps} aria-labelledby={`${formId}-supplier`} options={suppliers.options}
          value={header.supplierId} disabled={posted || busy} placeholder="اختر المورد…"
          onChange={(supplierId) => supplierId != null && changeHeader({ supplierId })} />
      </Labelled>
      <Labelled id={`${formId}-warehouse`} label="المخزن" basis={170}>
        <Combobox {...comboboxProps} aria-labelledby={`${formId}-warehouse`} options={warehouses.options}
          value={header.warehouseId} disabled={posted || busy} placeholder="اختر…"
          onChange={(warehouseId) => warehouseId != null && changeHeader({ warehouseId })} />
      </Labelled>
      <TextField size="small" label="فاتورة المشتريات" placeholder="بدون" value={header.purchaseInvoiceId}
        disabled={posted} sx={{ flex: '0 1 140px' }} error={!invoiceIdValid}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => changeHeader({ purchaseInvoiceId: event.target.value }, false)}
        onBlur={saveTextOnBlur('purchaseInvoiceId', purchaseReturn?.purchaseInvoiceId == null ? ''
          : String(purchaseReturn.purchaseInvoiceId))} />
      <TextField size="small" placeholder="البيان" value={header.description} disabled={posted}
        sx={{ flex: '1 1 160px', minWidth: 0 }} error={header.description.length > MAX_DESCRIPTION_LENGTH}
        slotProps={{ htmlInput: { 'aria-label': 'البيان' } }}
        onChange={(event) => changeHeader({ description: event.target.value }, false)}
        onBlur={saveTextOnBlur('description', purchaseReturn?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.header && <Alert severity="warning">{entryErrors.header}</Alert>}

    {/* Entry row: one line at a time; Enter moves to the next field */}
    {!posted && <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexShrink: 0 }}
      onKeyDown={onEntryKeyDown}>
      <Box sx={{ flex: 2, minWidth: 170 }}>
        <Combobox {...comboboxProps} ref={productRef} aria-label="الصنف" options={products.options}
          value={entry.productId} placeholder="اختر الصنف…"
          onChange={(productId) => setEntry((previous) => ({ ...previous, productId }))} />
        {entryErrors.productId && <Typography variant="caption" color="error">{entryErrors.productId}</Typography>}
      </Box>
      {entryField('batchNumber', batchRef, 'التشغيلة', {
        placeholder: invoiceIdText ? 'تشغيلة الفاتورة' : EARLIEST_EXPIRY_LABEL,
        slotProps: { inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } },
      })}
      {entryField('expiryDate', expiryRef, 'الصلاحية', {
        type: 'date', sx: { flex: 1, minWidth: 140 }, helperText: entryErrors.expiryDate ?? 'تُترك إن كان للتشغيلة تاريخ واحد',
        slotProps: { inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } },
      })}
      {entryField('quantity', quantityRef, 'الكمية', { slotProps: { htmlInput: { inputMode: 'numeric', dir: 'ltr' } } })}
      {entryField('discountPercent', discountRef, 'الخصم %', {
        placeholder: invoiceIdText ? 'من الفاتورة' : '0', disabled: !!invoiceIdText,
        value: invoiceIdText ? '' : entry.discountPercent,
        slotProps: { inputLabel: { shrink: true }, htmlInput: { inputMode: 'decimal', dir: 'ltr' } },
      })}
      <Button ref={okRef} variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={saveEntry}
        sx={{ flexShrink: 0, height: 40, minWidth: 96 }}>
        {editingExistingLine ? 'تحديث' : 'OK'}
      </Button>
    </Stack>}

    {/* The lines as the backend has them */}
    <Box sx={{ flex: 1, minHeight: 160 }}>
      <AgGridProvider modules={modules}>
        <AgGridReact
          rowData={lines}
          columnDefs={columnDefs}
          getRowId={({ data }) => String(data.id)}
          // A click on a line edits it, except on its delete button
          onRowClicked={({ data, event }) => !posted && !event?.target?.closest?.('button') && editLine(data)}
          rowStyle={posted ? undefined : { cursor: 'pointer' }}
          defaultColDef={{ sortable: false, resizable: true, wrapHeaderText: true, autoHeaderHeight: true }}
          enableRtl
          enableCellTextSelection
          ensureDomOrder
          overlayNoRowsTemplate="<span>أدخل الأصناف المرتجعة: الصنف والتشغيلة والكمية ثم OK</span>"
        />
      </AgGridProvider>
    </Box>

    {/* Totals and actions */}
    <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      {purchaseReturn && !posted && <>
        <Button variant="contained" color="success" startIcon={<SendIcon />} disabled={busy || lines.length === 0}
          onClick={post}>
          ترحيل
        </Button>
        <Button color="error" startIcon={<DeleteForeverIcon />} disabled={busy} onClick={deleteDraft}>
          حذف المسودة
        </Button>
      </>}
      {purchaseReturn && <Button startIcon={<AddIcon />} disabled={busy} onClick={openNew}>جديد</Button>}
      <Box sx={{ flex: 1 }} />
      <Total label="تكلفة البضاعة" value={purchaseReturn ? purchaseReturn.stockValue : '0'} />
      <Total label="فرق السعر" value={purchaseReturn ? purchaseReturn.priceDifference : '0'} />
      <Total label="الصافي" value={purchaseReturn?.netTotal ?? '0'} />
      <Total label="الضريبة" value={purchaseReturn?.vatTotal ?? '0'} />
      {purchaseReturn && Big(purchaseReturn.roundingDifference).signum() !== 0 &&
        <Total label="فرق التقريب" value={purchaseReturn.roundingDifference} />}
      <Total label="الإجمالي" value={purchaseReturn?.total ?? '0'} strong />
    </Stack>
  </Box>;
}
