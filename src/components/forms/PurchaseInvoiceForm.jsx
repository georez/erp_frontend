'use client';

import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { TextField, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef } from 'react';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount, GAIN_COLOR, isNonZero, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import {
  DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow,
} from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { EntryField, EntryRow, ExpiryField, OkButton, ProductField } from './document/EntryFields';
import {
  checkBatchNumber, checkExpiry, checkQuantity, checkRequiredDiscount, hasErrors, headerProblem, missingProduct,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/*
 * The purchase invoice document: stock bought from a supplier, on credit.
 *
 * 1. The header (supplier, warehouse, the supplier's invoice number and date, description) is typed in and saved as
 *    each field is left. The first product's OK creates the draft.
 * 2. Its products: the entry row sends a product, the quantity bought and a discount off the public price (required:
 *    0 for none).
 * 3. Their batches (إدخال التشغيلات): each product's units split by batch number and expiry date, which must add up
 *    to its quantity before the invoice is posted. The products can still change then; a product is removed only by
 *    its own delete button, which takes its batches with it.
 *
 * Posting receives the batches and posts the journal entry; what the supplier is owed is the total rounded to 2
 * decimals. A posted invoice can't change.
 */

const MAX_SUPPLIER_INVOICE_NUMBER_LENGTH = 50;

const EMPTY_HEADER = {
  supplierId: null, warehouseId: null, supplierInvoiceNumber: '', supplierInvoiceDate: '', description: '',
};
const EMPTY_LINE = { productId: null, quantity: '', discountPercent: '' };
// quantityFilled: the quantity is what was left of the product to put in a batch, filled in (not typed)
const EMPTY_BATCH = { productId: null, batchNumber: '', expiryDate: '', quantity: '', quantityFilled: false };

const headerFrom = (loaded) => ({
  supplierId: loaded.supplierId,
  warehouseId: loaded.warehouseId,
  supplierInvoiceNumber: loaded.supplierInvoiceNumber ?? '',
  supplierInvoiceDate: loaded.supplierInvoiceDate ?? '',
  description: loaded.description ?? '',
});

const headerBody = (header) => ({
  supplierId: header.supplierId,
  warehouseId: header.warehouseId,
  supplierInvoiceNumber: header.supplierInvoiceNumber.trim() || null,
  supplierInvoiceDate: header.supplierInvoiceDate || null,
  description: header.description.trim() || null,
});

const supplierNumberTooLong = (header) =>
  header.supplierInvoiceNumber.trim().length > MAX_SUPPLIER_INVOICE_NUMBER_LENGTH;

/** The product entry row's errors by field, and the line to send when it has none. */
function checkLineEntry(entry) {
  const quantity = checkQuantity(entry.quantity);
  const discount = checkRequiredDiscount(entry.discountPercent);
  const errors = {
    productId: missingProduct(entry.productId),
    quantity: quantity.error,
    discountPercent: discount.error,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  return { errors, line: { productId: entry.productId, quantity: quantity.quantity, discountPercent: discount.discount } };
}

/** The batch entry row's errors by field, and the batch to send when it has none. */
function checkBatchEntry(entry, invoiceLine) {
  const number = checkBatchNumber(entry.batchNumber);
  const expiry = checkExpiry(entry.expiryDate);
  const quantity = checkQuantity(entry.quantity);
  const errors = {
    productId: invoiceLine ? null : 'حدّد الصنف',
    batchNumber: number.error,
    expiryDate: expiry.error,
    quantity: quantity.error,
  };
  if (hasErrors(errors)) {
    return { errors, batch: null };
  }
  return { errors, batch: { batchNumber: number.number, expiryDate: expiry.date, quantity: quantity.quantity } };
}

/** What's left of the invoice line's units to put in a batch (zero when none). */
const unitsLeftToBatch = (invoiceLine) => (invoiceLine
  ? Big(invoiceLine.quantity).subtract(Big(invoiceLine.batchedQuantity))
  : Big(0));

const batchedColumn = {
  field: 'batchedQuantity', headerName: 'في التشغيلات', flex: 1, minWidth: 95,
  valueFormatter: ({ value }) => formatAmount(value),
  cellStyle: ({ data }) => {
    const complete = data.batchedQuantity === data.quantity;
    return { ...NUMBER_CELL, color: complete ? GAIN_COLOR : LOSS_COLOR };
  },
};

const lineColumns = ({ batchesPhase, isPosted, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  amountColumn('quantity', 'الكمية', 85),
  ...(batchesPhase ? [batchedColumn] : []),
  amountColumn('publicPrice', 'سعر الجمهور', 85),
  amountColumn('discountPercent', 'الخصم %'),
  amountColumn('netAmount', 'الصافي', 95),
  amountColumn('vatPercent', 'الضريبة %', 100),
  amountColumn('vatAmount', 'الضريبة', 85),
  amountColumn('unitCost', 'تكلفة الوحدة', 95),
  ...deleteColumn(isPosted, onDelete),
];

const batchColumns = ({ isPosted, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  amountColumn('quantity', 'الكمية', 85),
  ...deleteColumn(isPosted, onDelete, (row) => `${row.productName} ${row.batchNumber}`),
];

export default function PurchaseInvoiceForm({ formId, formTitle, invoiceId }) {
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const confirm = useConfirm();
  const doc = useDocument({
    api: '/api/purchase-invoices', documentId: invoiceId, formId, formTitle, page: '/dashboard/purchase-invoice',
    idParam: 'invoiceId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: invoice, header, editable, isDraft, isPosted } = doc;
  const lineRow = useEntryRow(EMPTY_LINE);
  const batchRow = useEntryRow(EMPTY_BATCH);

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
  const batchRows = useMemo(() => lines.flatMap((line) => line.batches.map((batch) => ({
    ...batch, lineId: line.id, productId: line.productId, productName: line.productName,
  }))), [lines]);
  const batchesIncomplete = lines.some((line) => line.batchedQuantity !== line.quantity);
  // The batch row's products: the invoice's, with their barcodes for a scanner
  const batchProductOptions = useMemo(() => products.options.filter(
    (option) => lines.some((line) => line.productId === option.value)), [products.options, lines]);
  const lineOfProduct = (productId) => lines.find((line) => line.productId === productId);

  // --- phase 1: the products ---

  /** Sends the line; the product stays chosen, the rest is cleared at once. */
  const saveLine = () => {
    const headerWarning = doc.isNew ? headerProblem(header, { needsSupplier: true }) : null;
    const { errors, line } = checkLineEntry(lineRow.entry);
    lineRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line);
    lineRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  /** A product's line into the entry row, to change it; OK then replaces it (its batches stay). */
  const editLine = (line) => lineRow.fill({
    productId: line.productId, quantity: line.quantity, discountPercent: line.discountPercent,
  }, quantityRef);

  /** Deletes a product's line, with its batches: asked first when it has some. */
  const deleteLine = async (line) => {
    if (line.batches.length > 0 && !await confirm({
      title: `حذف ${line.productName} وتشغيلاته من الفاتورة؟`, confirmLabel: 'حذف', color: 'error',
    })) {
      return;
    }
    doc.sendToDraft(`/lines/${line.id}`, 'DELETE');
    // Its batches go with it: the batch row can't be one of them any more
    batchRow.setEntry((previous) => {
      if (previous.productId !== line.productId) {
        return previous;
      }
      const clearedQuantity = previous.quantityFilled ? { quantity: '', quantityFilled: false } : {};
      return { ...previous, productId: null, ...clearedQuantity };
    });
  };

  // --- phase 2: the batches ---

  /** A typed quantity is the user's own; a filled-in one is replaced when another product is chosen. */
  const setBatchField = (field) => (value) => batchRow.setEntry((previous) => ({
    ...previous, [field]: value, ...(field === 'quantity' && { quantityFilled: false }),
  }));

  /**
   * The batch row's product: its line, and its units not in a batch yet as the quantity when none is typed (also
   * replacing what another product left, filled in as type-ahead passed it on the way to this one).
   */
  const chooseBatchProduct = (productId) => batchRow.setEntry((previous) => {
    const quantityTyped = previous.quantity !== '' && !previous.quantityFilled;
    if (quantityTyped) {
      return { ...previous, productId };
    }
    const left = unitsLeftToBatch(lineOfProduct(productId));
    const filled = left.signum() > 0;
    return { ...previous, productId, quantity: filled ? left.toPlainString() : '', quantityFilled: filled };
  });

  /** Sends the batch; the row keeps its product and is otherwise cleared at once. */
  const saveBatch = () => {
    const invoiceLine = lineOfProduct(batchRow.entry.productId);
    const { errors, batch } = checkBatchEntry(batchRow.entry, invoiceLine);
    batchRow.setErrors(errors);
    if (!batch) {
      return;
    }
    doc.sendToDraft(`/lines/${invoiceLine.id}/batches`, 'PUT', batch);
    // Back to the product, like the other entry rows: Enter moves on to its next batch, typing picks another
    batchRow.clearKeepingProduct();
    batchProductRef.current?.focus();
  };

  const editBatch = (row) => batchRow.fill({
    productId: row.productId, batchNumber: row.batchNumber, expiryDate: formatExpiry(row.expiryDate),
    quantity: row.quantity, quantityFilled: false,
  }, batchQuantityRef);

  // --- the document ---

  const newInvoice = () => {
    doc.openNew();
    lineRow.clear();
    batchRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة فاتورة المشتريات رقم ${invoice.id}؟`)) {
      newInvoice();
    }
  };

  const editingExistingLine = lineRow.entry.productId != null && lineOfProduct(lineRow.entry.productId) != null;
  const editingExistingBatch = batchRows.some((row) => row.productId === batchRow.entry.productId
    && row.batchNumber === batchRow.entry.batchNumber.trim()
    && formatExpiry(row.expiryDate) === batchRow.entry.expiryDate);

  const status = invoice?.status === 'BATCHES'
    ? { label: 'مسودة · التشغيلات', color: 'info' }
    : documentStatus(invoice, { newLabel: 'جديدة', postedLabel: 'مُرحَّلة' });
  const nextStep = batchesPhase
    ? { onClick: () => doc.sendToDraft('/post', 'POST'), disabled: lines.length === 0 || batchesIncomplete }
    : {
      label: 'إدخال التشغيلات', icon: <PlaylistAddIcon />, disabled: lines.length === 0,
      onClick: () => doc.sendToDraft('/batches-phase', 'POST'),
    };

  const lineColumnDefs = lineColumns({ batchesPhase, isPosted, onDelete: deleteLine });
  const batchColumnDefs = batchColumns({
    isPosted, onDelete: (row) => doc.sendToDraft(`/batches/${row.id}`, 'DELETE'),
  });

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={invoice ? `فاتورة مشتريات رقم ${invoice.id}` : 'فاتورة مشتريات جديدة'} status={status} />
      <HeaderCombobox id={`${formId}-supplier`} label="المورد" basis={220} options={suppliers.options}
        value={header.supplierId} disabled={!editable} placeholder="اختر المورد…"
        onChange={(supplierId) => doc.changeHeader({ supplierId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={!editable} onChange={(warehouseId) => doc.changeHeader({ warehouseId })} />
      <TextField size="small" label="رقم فاتورة المورد" value={header.supplierInvoiceNumber} disabled={!editable}
        sx={{ flex: '1 1 120px', minWidth: 110 }} error={supplierNumberTooLong(header)}
        slotProps={{ htmlInput: { dir: 'ltr' } }}
        onChange={(event) => doc.editHeader({ supplierInvoiceNumber: event.target.value })}
        onBlur={() => doc.saveHeader()} />
      <TextField size="small" label="تاريخ فاتورة المورد" type="date" value={header.supplierInvoiceDate}
        disabled={!editable} sx={{ flex: '0 0 150px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }}
        onChange={(event) => doc.editHeader({ supplierInvoiceDate: event.target.value })}
        onBlur={() => doc.saveHeader()} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={suppliers.error ?? warehouses.error ?? products.error}
      errorMessage={doc.errorMessage} onCloseError={() => doc.setErrorMessage(null)}
      headerWarning={lineRow.errors.header} />

    {/* Phase 1, the products: one at a time; Enter moves to the next field */}
    {editable && <EntryRow fieldRefs={[productRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={lineRow.entry.productId}
        onChange={lineRow.setField('productId')} error={lineRow.errors.productId} />
      <EntryField label="الكمية" kind="numeric" value={lineRow.entry.quantity} onChange={lineRow.setField('quantity')}
        inputRef={quantityRef} error={lineRow.errors.quantity} />
      <EntryField label="الخصم %" kind="decimal" value={lineRow.entry.discountPercent}
        onChange={lineRow.setField('discountPercent')} inputRef={discountRef} error={lineRow.errors.discountPercent} />
      <OkButton okRef={okRef} onClick={saveLine} updating={editingExistingLine} />
    </EntryRow>}
    <LinesGrid rows={lines} columnDefs={lineColumnDefs} isPosted={isPosted} onEdit={editLine} minHeight={120}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT
        : 'أدخل أصناف الفاتورة: الصنف والكمية والخصم ثم OK؛ ثم انتقل إلى إدخال التشغيلات'} />

    {/* Phase 2, their batches, once the products are entered */}
    {batchesPhase && <>
      <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>التشغيلات</Typography>
      {isDraft && <EntryRow fieldRefs={[batchProductRef, batchNumberRef, batchExpiryRef, batchQuantityRef, batchOkRef]}>
        <ProductField productRef={batchProductRef} options={batchProductOptions} value={batchRow.entry.productId}
          onChange={chooseBatchProduct} placeholder="صنف من الفاتورة…" error={batchRow.errors.productId} />
        <EntryField label="التشغيلة" kind="batch" value={batchRow.entry.batchNumber}
          onChange={setBatchField('batchNumber')} inputRef={batchNumberRef} error={batchRow.errors.batchNumber}
          minWidth={100} />
        <ExpiryField value={batchRow.entry.expiryDate} onChange={setBatchField('expiryDate')}
          inputRef={batchExpiryRef} error={batchRow.errors.expiryDate} />
        <EntryField label="الكمية" kind="numeric" value={batchRow.entry.quantity} onChange={setBatchField('quantity')}
          inputRef={batchQuantityRef} error={batchRow.errors.quantity} />
        <OkButton okRef={batchOkRef} onClick={saveBatch} updating={editingExistingBatch} />
      </EntryRow>}
      <LinesGrid rows={batchRows} columnDefs={batchColumnDefs} isPosted={isPosted} onEdit={editBatch} minHeight={120}
        emptyText="أدخل تشغيلات كل صنف: الصنف والتشغيلة والصلاحية والكمية ثم OK" />
    </>}

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending} nextStep={nextStep}
      onDeleteDraft={deleteThisDraft} onNew={newInvoice}
      onPrint={invoice ? () => openPrintout('purchase-invoice', invoice.id) : undefined}>
      <Total label="الصافي" value={invoice?.netTotal ?? '0'} />
      <Total label="الضريبة" value={invoice?.vatTotal ?? '0'} />
      {invoice && isNonZero(invoice.roundingDifference) &&
        <Total label="فرق التقريب" value={invoice.roundingDifference} />}
      <Total label="الإجمالي" value={invoice?.total ?? '0'} strong />
    </DocumentActions>
  </DocumentWindow>;
}
