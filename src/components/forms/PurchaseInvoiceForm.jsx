'use client';

import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import {
  amountColumn, checkBatchNumber, checkExpiry, deleteColumn, DescriptionField, DISCOUNT_ERROR, DocumentActions,
  documentStatus, DocumentTitle, EntryField, EntryRow, expiryColumn, ExpiryField, HeaderCombobox, LinesGrid,
  formatAmount, MAX_DESCRIPTION_LENGTH, NUMBER_CELL, OkButton, ProductField, REQUIRED, Total, useDocument, useOptions,
} from './documentForm';

const MAX_SUPPLIER_INVOICE_NUMBER_LENGTH = 50;
const EMPTY_HEADER = {
  supplierId: null, warehouseId: null, supplierInvoiceNumber: '', supplierInvoiceDate: '', description: '',
};
const EMPTY_LINE = { productId: null, quantity: '', discountPercent: '' };
// quantityFilled: the quantity is what was left of the product to put in a batch, filled in (not typed)
const EMPTY_BATCH = { productId: null, batchNumber: '', expiryDate: '', quantity: '', quantityFilled: false };

/** Whole units in a positive whole number's text, or the error to show. */
const checkQuantity = (text) => {
  if (text.trim() === '') {
    return { error: REQUIRED };
  }
  const quantity = parseWholeUnits(text);
  return quantity != null && Big(quantity).signum() > 0 ? { quantity } : { error: 'عدد صحيح أكبر من صفر' };
};

/**
 * The purchase invoice document: stock bought from a supplier, on credit, entered in two phases. First its products:
 * the entry row sends a product, the quantity bought and a discount off the public price to the backend (OK). Then
 * (إدخال التشغيلات) their batches: each product's units split by batch number and expiry date, which must add up to
 * its quantity before the invoice is posted. The products can still change then; a product is removed only by its
 * own delete button, which takes its batches with it. Posting receives the batches and posts the journal entry; what
 * the supplier is owed is the total rounded to 2 decimals. A posted invoice can't change.
 */
export default function PurchaseInvoiceForm({ formId, formTitle, invoiceId }) {
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const {
    document: invoice, loadError, header, changeHeader, saveTextOnBlur, busy, errorMessage, setErrorMessage, posted,
    saveToDraft, request, openNew, deleteDraft,
  } = useDocument({
    api: '/api/purchase-invoices', documentId: invoiceId, formId, formTitle, page: '/dashboard/purchase-invoice',
    idParam: 'invoiceId', emptyHeader: EMPTY_HEADER,
    headerFrom: (loaded) => ({
      supplierId: loaded.supplierId,
      warehouseId: loaded.warehouseId,
      supplierInvoiceNumber: loaded.supplierInvoiceNumber ?? '',
      supplierInvoiceDate: loaded.supplierInvoiceDate ?? '',
      description: loaded.description ?? '',
    }),
    headerBody: (next) => ({
      supplierId: next.supplierId,
      warehouseId: next.warehouseId,
      supplierInvoiceNumber: next.supplierInvoiceNumber.trim() || null,
      supplierInvoiceDate: next.supplierInvoiceDate || null,
      description: next.description.trim() || null,
    }),
  });

  const [line, setLine] = useState(EMPTY_LINE);
  const [lineErrors, setLineErrors] = useState({});
  const [batch, setBatch] = useState(EMPTY_BATCH);
  const [batchErrors, setBatchErrors] = useState({});
  const productRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);
  const batchProductRef = useRef(null);
  const batchNumberRef = useRef(null);
  const batchExpiryRef = useRef(null);
  const batchQuantityRef = useRef(null);
  const batchOkRef = useRef(null);

  const lines = useMemo(() => invoice?.lines ?? [], [invoice]);
  const batchesPhase = invoice != null && invoice.status !== 'DRAFT';
  const batchRows = useMemo(() => lines.flatMap((invoiceLine) => invoiceLine.batches.map((invoiceBatch) => ({
    ...invoiceBatch, lineId: invoiceLine.id, productId: invoiceLine.productId, productName: invoiceLine.productName,
  }))), [lines]);
  const incomplete = lines.some((invoiceLine) => invoiceLine.batchedQuantity !== invoiceLine.quantity);
  const optionsError = suppliers.error ?? warehouses.error ?? products.error;
  // The invoice's products, with their barcodes for a scanner
  const batchProductOptions = useMemo(() => products.options.filter((option) => lines.some(
    (invoiceLine) => invoiceLine.productId === option.value)), [products.options, lines]);
  const setLineField = (field) => (value) => setLine((previous) => ({ ...previous, [field]: value }));
  const setBatchField = (field) => (value) => setBatch((previous) => ({
    ...previous, [field]: value, ...(field === 'quantity' && { quantityFilled: false }),
  }));

  // --- products ---

  const saveLine = async () => {
    const quantity = checkQuantity(line.quantity);
    const discountEntered = line.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(line.discountPercent) : null;
    const errors = {
      header: header.supplierId == null ? 'حدّد المورد أولاً'
        : header.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: line.productId == null ? 'حدّد الصنف' : null,
      quantity: quantity.error,
      discountPercent: discountEntered && !discount ? DISCOUNT_ERROR : null,
    };
    setLineErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH
      || header.supplierInvoiceNumber.trim().length > MAX_SUPPLIER_INVOICE_NUMBER_LENGTH) {
      return;
    }
    // As text, so no number passes through a JavaScript number
    const saved = await saveToDraft('/lines', {
      productId: line.productId,
      quantity: quantity.quantity,
      discountPercent: discountEntered ? normalizeDecimalText(line.discountPercent) : null,
    });
    if (saved) {
      // The product stays selected; the cursor goes back to it, where typing picks another
      setLine((previous) => ({ ...EMPTY_LINE, productId: previous.productId }));
      setLineErrors({});
      productRef.current?.focus();
    }
  };

  /** A product's line into the entry row, to change it; OK then replaces it (its batches stay). */
  const editLine = (invoiceLine) => {
    // Rendered at once (the grid calls this from its own listener), so the quantity is in its field before it's
    // selected, and typing replaces it
    flushSync(() => {
      setLine({
        productId: invoiceLine.productId, quantity: invoiceLine.quantity, discountPercent: invoiceLine.discountPercent,
      });
      setLineErrors({});
    });
    quantityRef.current?.focus();
    quantityRef.current?.select();
  };

  /** Deletes a product's line, with its batches: asked first when it has some. */
  const deleteLine = async (invoiceLine) => {
    if (invoiceLine.batches.length > 0 && !window.confirm(`حذف ${invoiceLine.productName} وتشغيلاته من الفاتورة؟`)) {
      return;
    }
    await request(`/lines/${invoiceLine.id}`, 'DELETE');
    // Its batches went with it: the batch row can't be one of them any more
    setBatch((previous) => (previous.productId === invoiceLine.productId
      ? { ...previous, productId: null, ...(previous.quantityFilled && { quantity: '', quantityFilled: false }) }
      : previous));
  };

  // --- batches ---

  /**
   * The batch row's product: its line, and its units not in a batch yet as the quantity when none is typed (also
   * replacing what another product left, filled in as type-ahead passed it on the way to this one).
   */
  const chooseBatchProduct = (productId) => {
    const invoiceLine = lines.find((candidate) => candidate.productId === productId);
    const left = invoiceLine ? Big(invoiceLine.quantity).subtract(Big(invoiceLine.batchedQuantity)) : Big(0);
    setBatch((previous) => {
      if (previous.quantity !== '' && !previous.quantityFilled) {
        return { ...previous, productId };
      }
      const filled = left.signum() > 0;
      return { ...previous, productId, quantity: filled ? left.toPlainString() : '', quantityFilled: filled };
    });
  };

  const saveBatch = async () => {
    const invoiceLine = lines.find((candidate) => candidate.productId === batch.productId);
    const number = checkBatchNumber(batch.batchNumber);
    const expiry = checkExpiry(batch.expiryDate);
    const quantity = checkQuantity(batch.quantity);
    const errors = {
      productId: invoiceLine ? null : 'حدّد الصنف',
      batchNumber: number.error,
      expiryDate: expiry.error,
      quantity: quantity.error,
    };
    setBatchErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    const saved = await saveToDraft(`/lines/${invoiceLine.id}/batches`, {
      batchNumber: number.number, expiryDate: expiry.date, quantity: quantity.quantity,
    });
    if (saved) {
      // The product stays chosen, with what's left of it to put in a batch
      const savedLine = saved.lines.find((candidate) => candidate.id === invoiceLine.id);
      const left = savedLine ? Big(savedLine.quantity).subtract(Big(savedLine.batchedQuantity)) : Big(0);
      setBatch({
        ...EMPTY_BATCH, productId: batch.productId, quantity: left.signum() > 0 ? left.toPlainString() : '',
        quantityFilled: left.signum() > 0,
      });
      setBatchErrors({});
      // Back to the product, like the other entry rows: Enter moves on to its next batch, typing picks another
      batchProductRef.current?.focus();
    }
  };

  const editBatch = (row) => {
    flushSync(() => {
      setBatch({
        productId: row.productId, batchNumber: row.batchNumber, expiryDate: formatExpiry(row.expiryDate),
        quantity: row.quantity, quantityFilled: false,
      });
      setBatchErrors({});
    });
    batchQuantityRef.current?.focus();
    batchQuantityRef.current?.select();
  };

  const newInvoice = () => {
    openNew();
    setLine(EMPTY_LINE);
    setLineErrors({});
    setBatch(EMPTY_BATCH);
    setBatchErrors({});
  };

  const editingExistingLine = line.productId != null && lines.some((candidate) => candidate.productId === line.productId);
  const editingExistingBatch = batchRows.some((row) => row.productId === batch.productId
    && row.batchNumber === batch.batchNumber.trim() && formatExpiry(row.expiryDate) === batch.expiryDate);

  // Rebuilt every render: the delete buttons need the current invoice and busy state
  const lineColumns = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    amountColumn('quantity', 'الكمية', 85),
    ...(batchesPhase ? [{
      field: 'batchedQuantity', headerName: 'في التشغيلات', flex: 1, minWidth: 95,
      valueFormatter: ({ value }) => formatAmount(value),
      cellStyle: ({ data }) => ({ ...NUMBER_CELL, color: data.batchedQuantity === data.quantity ? '#2e7d32' : '#c62828' }),
    }] : []),
    amountColumn('publicPrice', 'سعر الجمهور', 85),
    amountColumn('discountPercent', 'الخصم %'),
    amountColumn('netAmount', 'الصافي', 95),
    amountColumn('vatPercent', 'الضريبة %', 100),
    amountColumn('vatAmount', 'الضريبة', 85),
    amountColumn('unitCost', 'تكلفة الوحدة', 95),
    ...deleteColumn(posted, busy, deleteLine),
  ];
  const batchColumns = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    { field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110 },
    expiryColumn(),
    amountColumn('quantity', 'الكمية', 85),
    ...deleteColumn(posted, busy, (row) => request(`/batches/${row.id}`, 'DELETE'),
      (row) => `${row.productName} ${row.batchNumber}`),
  ];

  const status = invoice?.status === 'BATCHES' ? { label: 'مسودة · التشغيلات', color: 'info' }
    : documentStatus(invoice, { newLabel: 'جديدة', postedLabel: 'مُرحَّلة' });
  const nextStep = batchesPhase
    ? { onClick: () => request('/post', 'POST'), disabled: lines.length === 0 || incomplete }
    : {
      label: 'إدخال التشغيلات', icon: <PlaylistAddIcon />, disabled: lines.length === 0,
      onClick: () => request('/batches-phase', 'POST'),
    };

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <DocumentTitle title={invoice ? `فاتورة مشتريات رقم ${invoice.id}` : 'فاتورة مشتريات جديدة'} status={status} />
      <HeaderCombobox id={`${formId}-supplier`} label="المورد" basis={220} options={suppliers.options}
        value={header.supplierId} disabled={posted || busy} placeholder="اختر المورد…"
        onChange={(supplierId) => changeHeader({ supplierId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={posted || busy} onChange={(warehouseId) => changeHeader({ warehouseId })} />
      <TextField size="small" label="رقم فاتورة المورد" value={header.supplierInvoiceNumber} disabled={posted}
        sx={{ flex: '1 1 120px', minWidth: 110 }}
        error={header.supplierInvoiceNumber.trim().length > MAX_SUPPLIER_INVOICE_NUMBER_LENGTH}
        slotProps={{ htmlInput: { dir: 'ltr' } }}
        onChange={(event) => changeHeader({ supplierInvoiceNumber: event.target.value }, false)}
        onBlur={saveTextOnBlur('supplierInvoiceNumber', invoice?.supplierInvoiceNumber)} />
      <TextField size="small" label="تاريخ فاتورة المورد" type="date" value={header.supplierInvoiceDate}
        disabled={posted} sx={{ flex: '0 0 150px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }}
        onChange={(event) => changeHeader({ supplierInvoiceDate: event.target.value })} />
      <DescriptionField value={header.description} disabled={posted}
        onChange={(description) => changeHeader({ description }, false)}
        onBlur={saveTextOnBlur('description', invoice?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {lineErrors.header && <Alert severity="warning">{lineErrors.header}</Alert>}

    {/* The products: one at a time; Enter moves to the next field */}
    {!posted && <EntryRow fieldRefs={[productRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={line.productId}
        onChange={setLineField('productId')} error={lineErrors.productId} />
      <EntryField label="الكمية" kind="numeric" value={line.quantity} onChange={setLineField('quantity')}
        inputRef={quantityRef} error={lineErrors.quantity} />
      <EntryField label="الخصم %" kind="decimal" placeholder="0" value={line.discountPercent}
        onChange={setLineField('discountPercent')} inputRef={discountRef} error={lineErrors.discountPercent} />
      <OkButton okRef={okRef} busy={busy} onClick={saveLine} updating={editingExistingLine} />
    </EntryRow>}
    <LinesGrid rows={lines} columnDefs={lineColumns} posted={posted} onEdit={editLine} minHeight={120}
      emptyText="أدخل أصناف الفاتورة: الصنف والكمية والخصم ثم OK؛ ثم انتقل إلى إدخال التشغيلات" />

    {/* Their batches, once the products are entered */}
    {batchesPhase && <>
      <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>التشغيلات</Typography>
      {!posted && <EntryRow fieldRefs={[batchProductRef, batchNumberRef, batchExpiryRef, batchQuantityRef, batchOkRef]}>
        <ProductField productRef={batchProductRef} value={batch.productId} onChange={chooseBatchProduct}
          options={batchProductOptions}
          placeholder="صنف من الفاتورة…" error={batchErrors.productId} />
        <EntryField label="التشغيلة" kind="batch" value={batch.batchNumber} onChange={setBatchField('batchNumber')}
          inputRef={batchNumberRef} error={batchErrors.batchNumber} minWidth={100} />
        <ExpiryField value={batch.expiryDate} onChange={setBatchField('expiryDate')} inputRef={batchExpiryRef}
          error={batchErrors.expiryDate} />
        <EntryField label="الكمية" kind="numeric" value={batch.quantity} onChange={setBatchField('quantity')}
          inputRef={batchQuantityRef} error={batchErrors.quantity} />
        <OkButton okRef={batchOkRef} busy={busy} onClick={saveBatch} updating={editingExistingBatch} />
      </EntryRow>}
      <LinesGrid rows={batchRows} columnDefs={batchColumns} posted={posted} onEdit={editBatch} minHeight={120}
        emptyText="أدخل تشغيلات كل صنف: الصنف والتشغيلة والصلاحية والكمية ثم OK" />
    </>}

    <DocumentActions document={invoice} posted={posted} busy={busy} nextStep={nextStep}
      onDeleteDraft={async () => (await deleteDraft(`حذف مسودة فاتورة المشتريات رقم ${invoice.id}؟`)) && newInvoice()}
      onNew={newInvoice}>
      <Total label="الصافي" value={invoice?.netTotal ?? '0'} />
      <Total label="الضريبة" value={invoice?.vatTotal ?? '0'} />
      {invoice && Big(invoice.roundingDifference).signum() !== 0 &&
        <Total label="فرق التقريب" value={invoice.roundingDifference} />}
      <Total label="الإجمالي" value={invoice?.total ?? '0'} strong />
    </DocumentActions>
  </Box>;
}
