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
const API = '/api/purchase-invoices';
const MAX_SUPPLIER_INVOICE_NUMBER_LENGTH = 50;
const EMPTY_HEADER = {
  supplierId: null, warehouseId: null, supplierInvoiceNumber: '', supplierInvoiceDate: '', description: '',
};
const EMPTY_ENTRY = {
  productId: null, batchNumber: '', expiryDate: '', quantity: '', bonusQuantity: '', discountPercent: '',
};

/** One of the totals under the grid: its label and its amount. */
function Total({ label, value, strong }) {
  return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 700 : 400, ...NUMBER_CELL }}>
      <bdi>{formatAmount(value ?? '0')}</bdi>
    </Typography>
  </Stack>;
}

/**
 * The purchase invoice document: stock bought from a supplier, on credit. A draft is filled one batch at a time: the
 * entry row sends a product's batch (its number and expiry date: the same number with another date is another
 * batch), the quantity paid for, a bonus quantity (free units) and a discount off the public price to the backend (OK); the grid shows the lines as the
 * backend has them, with the price and VAT rate now and the amounts they give. Posting receives the stock and posts
 * the journal entry; what the supplier is owed is the total rounded to 2 decimals. A posted invoice can't change.
 *
 * The draft is created with its first line; its id then goes into the window's URL, so the window opens it again.
 */
export default function PurchaseInvoiceForm({ formId, formTitle, invoiceId }) {
  const { csrfFetch } = useContext(AuthContext);
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');

  const { data: invoice, error: loadError, mutate } = useSWR(
    invoiceId ? `${API}/${invoiceId}` : null, fetchJson, { revalidateOnFocus: false });

  // The header: for a new invoice, what's entered; for a draft, what it has (reset whenever it's loaded again).
  // Set during render, not in an effect, so the stale header is never shown:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [headerLoadedFrom, setHeaderLoadedFrom] = useState(null);
  if (invoice && invoice !== headerLoadedFrom) {
    setHeaderLoadedFrom(invoice);
    setHeader({
      supplierId: invoice.supplierId,
      warehouseId: invoice.warehouseId,
      supplierInvoiceNumber: invoice.supplierInvoiceNumber ?? '',
      supplierInvoiceDate: invoice.supplierInvoiceDate ?? '',
      description: invoice.description ?? '',
    });
  }

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const { send, busy, errorMessage, setErrorMessage } = useDocumentRequests(csrfFetch);
  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const quantityRef = useRef(null);
  const bonusRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const posted = invoice?.status === 'POSTED';
  const lines = useMemo(() => invoice?.lines ?? [], [invoice]);
  const optionsError = suppliers.error ?? warehouses.error ?? products.error;

  /** Shows the invoice a request answered with, or loads it again if the request failed. */
  const show = (saved) => mutate(saved ?? undefined, { revalidate: !saved });

  const headerBody = (changes = {}) => {
    const next = { ...header, ...changes };
    return {
      supplierId: next.supplierId,
      warehouseId: next.warehouseId,
      supplierInvoiceNumber: next.supplierInvoiceNumber.trim() || null,
      supplierInvoiceDate: next.supplierInvoiceDate || null,
      description: next.description.trim() || null,
    };
  };

  /** A header change: kept until the draft exists, saved at once on a draft (the texts when they're left). */
  const changeHeader = async (changes, save = true) => {
    setHeader((previous) => ({ ...previous, ...changes }));
    if (save && invoice && !posted) {
      await show(await send(`${API}/${invoice.id}`, 'PUT', headerBody(changes)));
    }
  };

  /** Saves a text of the header when it's left, if it changed. */
  const saveTextOnBlur = (field) => () => {
    if (invoice && (invoice[field] ?? '') !== header[field].trim()) {
      changeHeader({});
    }
  };

  const saveEntry = async () => {
    const quantity = parseWholeUnits(entry.quantity);
    const bonusEntered = entry.bonusQuantity.trim() !== '';
    const bonus = bonusEntered ? parseWholeUnits(entry.bonusQuantity) : '0';
    const discountEntered = entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      header: header.supplierId == null ? 'حدّد المورد أولاً'
        : header.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: entry.batchNumber.trim() === '' ? 'مطلوبة'
        : entry.batchNumber.trim().length > MAX_BATCH_NUMBER_LENGTH ? `الحد الأقصى ${MAX_BATCH_NUMBER_LENGTH} حرف` : null,
      expiryDate: entry.expiryDate ? null : 'مطلوبة',
      quantity: quantity != null ? null : 'عدد صحيح',
      bonusQuantity: bonus != null ? null : 'عدد صحيح',
      discountPercent: discountEntered && !discount ? 'من 0 إلى 100، حتى 3 أرقام عشرية' : null,
    };
    if (!errors.quantity && !errors.bonusQuantity && Big(quantity).add(Big(bonus)).signum() === 0) {
      errors.quantity = 'أدخل الكمية أو البونص';
    }
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH
      || header.supplierInvoiceNumber.trim().length > MAX_SUPPLIER_INVOICE_NUMBER_LENGTH) {
      return;
    }

    let id = invoice?.id;
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
      batchNumber: entry.batchNumber.trim(),
      expiryDate: entry.expiryDate || null,
      quantity,
      bonusQuantity: bonus,
      discountPercent: discountEntered ? normalizeDecimalText(entry.discountPercent) : null,
    });
    if (invoice) {
      await show(saved);
    } else {
      // From now on the window opens this draft (and loads it, with the line if it was saved)
      updateOpenFormUrl(`/dashboard/purchase-invoice?formTitle=${encodeURIComponent(formTitle)
        }&invoiceId=${encodeURIComponent(id)}`);
    }
    if (saved) {
      // The product stays selected (its next batch is often entered next); the cursor goes back to it, where Enter
      // moves on to the batch, and typing picks another product
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const deleteLine = async (lineId) => {
    await show(await send(`${API}/${invoice.id}/lines/${lineId}`, 'DELETE'));
  };

  const post = async () => {
    await show(await send(`${API}/${invoice.id}/post`, 'POST'));
  };

  const openNew = () => {
    updateOpenFormUrl(`/dashboard/purchase-invoice?formTitle=${encodeURIComponent(formTitle)}`);
    // Same supplier and warehouse: the next invoice is often from the same supplier
    setHeader((previous) => ({ ...previous, supplierInvoiceNumber: '', supplierInvoiceDate: '', description: '' }));
    // headerLoadedFrom stays the document just left: until the URL has changed, it's still the one loaded, and
    // forgetting it would load its header back over the cleared one
    setEntry(EMPTY_ENTRY);
    setEntryErrors({});
    setErrorMessage(null);
  };

  const deleteDraft = async () => {
    if (!window.confirm(`حذف مسودة فاتورة المشتريات رقم ${invoice.id}؟`)) {
      return;
    }
    if (await send(`${API}/${invoice.id}`, 'DELETE')) {
      openNew();
    }
  };

  // Enter moves product → batch → expiry → quantity → bonus → discount → OK, and Enter on OK sends the line
  const onEntryKeyDown = (event) => moveOnEnter(event,
    [productRef, batchRef, expiryRef, quantityRef, bonusRef, discountRef, okRef]);

  /** A grid row into the entry row, to change it; OK then replaces the line. */
  const editLine = (line) => {
    // Rendered at once (the grid calls this from its own listener, where React would render later), so the quantity
    // is in its field before it's selected, and typing replaces it instead of adding to it
    flushSync(() => {
      setEntry({
        productId: line.productId, batchNumber: line.batchNumber, expiryDate: line.expiryDate ?? '',
        quantity: line.quantity, bonusQuantity: line.bonusQuantity, discountPercent: line.discountPercent,
      });
      setEntryErrors({});
    });
    quantityRef.current?.focus();
    quantityRef.current?.select();
  };
  const editingExistingLine = entry.productId != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batchNumber.trim() && line.expiryDate === entry.expiryDate);

  const amountColumn = (field, headerName, minWidth = 90) => ({
    field, headerName, flex: 1, minWidth, valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
  });

  // Rebuilt every render: the delete buttons need the current invoice and busy state, and the grid only redraws the
  // cells whose values changed
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    { field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110 },
    { field: 'expiryDate', headerName: 'الصلاحية', flex: 1, minWidth: 110, cellStyle: NUMBER_CELL },
    amountColumn('quantity', 'الكمية', 85),
    amountColumn('bonusQuantity', 'البونص', 90),
    amountColumn('publicPrice', 'سعر الجمهور', 85),
    amountColumn('discountPercent', 'الخصم %', 90),
    amountColumn('netAmount', 'الصافي', 95),
    amountColumn('vatPercent', 'الضريبة %', 100),
    amountColumn('vatAmount', 'الضريبة', 85),
    amountColumn('unitCost', 'تكلفة الوحدة', 95),
    ...(posted ? [] : [{
      headerName: '', colId: 'delete', width: 56, resizable: false,
      cellRenderer: ({ data }) => <IconButton size="small" aria-label={`حذف ${data.productName}`} disabled={busy}
        onClick={() => deleteLine(data.id)}>
        <DeleteIcon fontSize="small" />
      </IconButton>,
    }]),
  ];

  const comboboxProps = { fullWidth: true, messages: COMBOBOX_MESSAGES };
  const status = !invoice ? { label: 'جديدة', color: 'default' }
    : posted ? { label: `مُرحَّلة · قيد ${invoice.journalEntryId}`, color: 'success' }
      : { label: 'مسودة', color: 'warning' };
  const numberField = { inputMode: 'numeric', dir: 'ltr' };
  const entryField = (field, ref, label, props = {}) => <TextField size="small" label={label} value={entry[field]}
    onChange={(event) => setEntry((previous) => ({ ...previous, [field]: event.target.value }))}
    inputRef={ref} error={!!entryErrors[field]} helperText={entryErrors[field]} sx={{ flex: 1, minWidth: 90 }}
    {...props} />;

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {invoice ? `فاتورة مشتريات رقم ${invoice.id}` : 'فاتورة مشتريات جديدة'}
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
      <TextField size="small" label="رقم فاتورة المورد" value={header.supplierInvoiceNumber} disabled={posted}
        sx={{ flex: '1 1 120px', minWidth: 110 }}
        error={header.supplierInvoiceNumber.trim().length > MAX_SUPPLIER_INVOICE_NUMBER_LENGTH}
        slotProps={{ htmlInput: { dir: 'ltr' } }}
        onChange={(event) => changeHeader({ supplierInvoiceNumber: event.target.value }, false)}
        onBlur={saveTextOnBlur('supplierInvoiceNumber')} />
      <TextField size="small" label="تاريخ فاتورة المورد" type="date" value={header.supplierInvoiceDate}
        disabled={posted} sx={{ flex: '0 0 150px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }}
        onChange={(event) => changeHeader({ supplierInvoiceDate: event.target.value })} />
      <TextField size="small" placeholder="البيان" value={header.description} disabled={posted}
        sx={{ flex: '1 1 160px', minWidth: 0 }} error={header.description.length > MAX_DESCRIPTION_LENGTH}
        slotProps={{ htmlInput: { 'aria-label': 'البيان' } }}
        onChange={(event) => changeHeader({ description: event.target.value }, false)}
        onBlur={saveTextOnBlur('description')} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.header && <Alert severity="warning">{entryErrors.header}</Alert>}

    {/* Entry row: one batch at a time; Enter moves to the next field */}
    {!posted && <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexShrink: 0 }}
      onKeyDown={onEntryKeyDown}>
      <Box sx={{ flex: 2, minWidth: 170 }}>
        <Combobox {...comboboxProps} ref={productRef} aria-label="الصنف" options={products.options}
          value={entry.productId} placeholder="اختر الصنف…"
          onChange={(productId) => setEntry((previous) => ({ ...previous, productId }))} />
        {entryErrors.productId && <Typography variant="caption" color="error">{entryErrors.productId}</Typography>}
      </Box>
      {entryField('batchNumber', batchRef, 'التشغيلة', { slotProps: { htmlInput: { dir: 'ltr' } } })}
      {entryField('expiryDate', expiryRef, 'الصلاحية', {
        type: 'date', sx: { flex: 1, minWidth: 140 }, helperText: entryErrors.expiryDate,
        slotProps: { inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } },
      })}
      {entryField('quantity', quantityRef, 'الكمية', { slotProps: { htmlInput: numberField } })}
      {entryField('bonusQuantity', bonusRef, 'البونص', { placeholder: '0', slotProps: { htmlInput: numberField } })}
      {entryField('discountPercent', discountRef, 'الخصم %', {
        placeholder: '0', slotProps: { htmlInput: { inputMode: 'decimal', dir: 'ltr' } },
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
          overlayNoRowsTemplate="<span>أدخل الأصناف تشغيلة تشغيلة: الصنف والتشغيلة والكمية والبونص والخصم ثم OK</span>"
        />
      </AgGridProvider>
    </Box>

    {/* Totals and actions */}
    <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      {invoice && !posted && <>
        <Button variant="contained" color="success" startIcon={<SendIcon />} disabled={busy || lines.length === 0}
          onClick={post}>
          ترحيل
        </Button>
        <Button color="error" startIcon={<DeleteForeverIcon />} disabled={busy} onClick={deleteDraft}>
          حذف المسودة
        </Button>
      </>}
      {invoice && <Button startIcon={<AddIcon />} disabled={busy} onClick={openNew}>جديد</Button>}
      <Box sx={{ flex: 1 }} />
      <Total label="الصافي" value={invoice?.netTotal} />
      <Total label="الضريبة" value={invoice?.vatTotal} />
      {invoice && Big(invoice.roundingDifference).signum() !== 0 &&
        <Total label="فرق التقريب" value={invoice.roundingDifference} />}
      <Total label="الإجمالي" value={invoice?.total} strong />
    </Stack>
  </Box>;
}
