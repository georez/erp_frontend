'use client';

import { TextField } from '@mui/material';
import useSWR from 'swr';
import { useMemo, useRef, useState } from 'react';
import { fetchJson } from '@/utils/fetchJson';
import { parseWholeUnits } from '@/utils/decimals';
import { formatAmount, isNonZero, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import {
  DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow,
} from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { BatchPicker, EntryField, EntryRow, OkButton, ProductField } from './document/EntryFields';
import {
  checkOptionalDiscount, checkQuantity, hasErrors, headerProblem, missingProduct,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';

/*
 * The purchase return document: stock sent back to a supplier.
 *
 * The header is typed in and saved as each field is left. A return may name the posted purchase invoice the goods came
 * on: when its number is left, the supplier and warehouse become the invoice's, the products and batches to choose from
 * are the invoice's (with units left to return), each unit is credited at what it cost on the invoice, and the
 * discount field is off. Without one, the batches are those the warehouse has.
 *
 * Then the entry row sends one line at a time: a product, its batch (number and expiry date, chosen together by typing
 * part of either), the quantity and a discount. Posting takes the goods out of their batch, debits the supplier with
 * the total (rounded to 2 decimals), and puts the difference between what the supplier credits and what the goods cost
 * on purchase price differences.
 */

const EMPTY_HEADER = { supplierId: null, warehouseId: null, purchaseInvoiceId: null, description: '' };
// batch: { batchNumber, expiryDate, available }, one of the batches to choose from
const EMPTY_ENTRY = { productId: null, batch: null, quantity: '', discountPercent: '' };
const NO_BATCHES = [];

const headerFrom = (loaded) => ({
  supplierId: loaded.supplierId,
  warehouseId: loaded.warehouseId,
  purchaseInvoiceId: loaded.purchaseInvoiceId ?? null,
  description: loaded.description ?? '',
});

const headerBody = (header) => ({
  supplierId: header.supplierId,
  warehouseId: header.warehouseId,
  purchaseInvoiceId: header.purchaseInvoiceId ?? null,
  description: header.description.trim() || null,
});

const invoiceUrl = (id) => `/api/purchase-invoices/${id}`;

/** The posted invoice with the number typed: { invoice }, or { error } (not a number, not found, not posted). */
async function loadPostedInvoice(text) {
  const id = parseWholeUnits(text);
  if (id == null) {
    return { error: `رقم فاتورة المشتريات غير صحيح: ${text}` };
  }
  let invoice;
  try {
    invoice = await fetchJson(invoiceUrl(id));
  } catch (loadError) {
    return { error: loadError.message };
  }
  if (invoice.status !== 'POSTED') {
    return { error: `فاتورة المشتريات رقم ${invoice.id} غير مُرحَّلة: المرتجع يكون من فاتورة مُرحَّلة` };
  }
  return { invoice };
}

/** The batch options' query: the warehouse's batches of the product, against an invoice only the invoice's. */
function batchOptionsUrl(productId, warehouseId, invoiceId) {
  if (productId == null || warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({ productId, warehouseId, ...(invoiceId != null && { invoiceId }) });
  return `/api/purchase-returns/batch-options?${params}`;
}

/** The entry row's errors by field, and the line to send when it has none. */
function checkEntry(entry, againstInvoice) {
  const quantity = checkQuantity(entry.quantity);
  // Against an invoice the units are credited at what they cost on it: no discount
  const discount = againstInvoice ? { discount: null } : checkOptionalDiscount(entry.discountPercent);
  const errors = {
    productId: missingProduct(entry.productId),
    batch: entry.batch == null ? 'اختر التشغيلة' : null,
    quantity: quantity.error,
    discountPercent: discount.error,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  const line = {
    productId: entry.productId,
    batchNumber: entry.batch.batchNumber,
    expiryDate: entry.batch.expiryDate,
    quantity: quantity.quantity,
    discountPercent: discount.discount,
  };
  return { errors, line };
}

/**
 * What the goods cost: at the invoice's value while only purchases have moved the product in the warehouse since
 * (no price difference), else at the average. A line whose goods aren't in stock has none: posting refuses it.
 */
const stockValueColumn = {
  ...amountColumn('stockValue', 'تكلفة البضاعة', 100),
  valueFormatter: ({ value }) => (value == null ? 'غير متوفر' : formatAmount(value)),
  cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? LOSS_COLOR : 'inherit' }),
  tooltipValueGetter: ({ data }) => {
    if (!data || data.stockValue == null) {
      return undefined;
    }
    return data.atInvoiceValue ? 'بسعر الفاتورة: لم يتحرك الصنف في المخزن منذ الفاتورة إلا بمشتريات'
      : 'بمتوسط التكلفة';
  },
};

const gridColumns = (isPosted, onDelete) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  amountColumn('quantity', 'الكمية', 85),
  amountColumn('publicPrice', 'السعر', 85),
  amountColumn('discountPercent', 'الخصم %'),
  amountColumn('netAmount', 'الصافي', 95),
  amountColumn('vatPercent', 'الضريبة %', 100),
  amountColumn('vatAmount', 'الضريبة', 85),
  stockValueColumn,
  ...deleteColumn(isPosted, onDelete),
];

export default function PurchaseReturnForm({ formId, formTitle, returnId }) {
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const doc = useDocument({
    api: '/api/purchase-returns', documentId: returnId, formId, formTitle, page: '/dashboard/purchase-return',
    idParam: 'returnId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: purchaseReturn, header, editable, isDraft, isPosted } = doc;
  const entryRow = useEntryRow(EMPTY_ENTRY);
  const { entry, setEntry, setField } = entryRow;

  const productRef = useRef(null);
  const batchRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = purchaseReturn?.lines ?? [];

  // --- the invoice the goods came on ---

  const invoiceId = header.purchaseInvoiceId;
  const againstInvoice = invoiceId != null;
  // The invoice's products are the ones the return can take back
  const { data: invoice } = useSWR(againstInvoice ? invoiceUrl(invoiceId) : null, fetchJson);
  const productOptions = useMemo(() => (againstInvoice
    ? products.options.filter((option) => invoice?.lines.some((line) => line.productId === option.value))
    : products.options), [againstInvoice, invoice, products.options]);

  // The invoice number as typed, until the field is left; then the header's invoice is shown
  const [typedInvoice, setTypedInvoice] = useState(null);
  const headerInvoiceText = invoiceId == null ? '' : String(invoiceId);
  const invoiceText = typedInvoice ?? headerInvoiceText;

  /**
   * The invoice field left: a posted invoice's number makes the return against it, with the invoice's supplier and
   * warehouse; an empty field makes it against none. Anything else is refused and the field shows the header's again.
   */
  const enterInvoice = async () => {
    const text = invoiceText.trim();
    setTypedInvoice(null);
    if (text === headerInvoiceText) {
      return;
    }
    if (text === '') {
      doc.changeHeader({ purchaseInvoiceId: null });
      return;
    }
    const { invoice: entered, error } = await loadPostedInvoice(text);
    if (error) {
      doc.showError(error);
      return;
    }
    // A product not on the invoice, or a batch of another warehouse, is the entry row's no more
    setEntry((previous) => ({
      ...previous,
      batch: null,
      productId: entered.lines.some((line) => line.productId === previous.productId) ? previous.productId : null,
    }));
    doc.changeHeader({ purchaseInvoiceId: entered.id, supplierId: entered.supplierId, warehouseId: entered.warehouseId });
  };

  // --- the entry row ---

  const { data: batchOptions = NO_BATCHES, isLoading: batchesLoading, mutate: reloadBatches } = useSWR(
    batchOptionsUrl(entry.productId, header.warehouseId, invoiceId), fetchJson);

  /** Sends the line; the row is cleared at once, so the next one can be typed while it's sent. */
  const saveEntry = () => {
    const headerWarning = doc.isNew ? headerProblem(header, { needsSupplier: true }) : null;
    const { errors, line } = checkEntry(entry, againstInvoice);
    entryRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line, products.labelOf(line.productId));
    // The product stays selected; the cursor goes back to it, where Enter moves on and typing picks another
    entryRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  /** A grid row into the entry row, to change it; OK then replaces the line. */
  const editLine = (line) => entryRow.fill({
    productId: line.productId,
    batch: { batchNumber: line.batchNumber, expiryDate: line.expiryDate },
    quantity: line.quantity,
    discountPercent: line.discountPercent,
  }, quantityRef);

  const editingExistingLine = entry.batch != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batch.batchNumber && line.expiryDate === entry.batch.expiryDate);

  const chooseBatch = (batch) => {
    setEntry((previous) => ({ ...previous, batch }));
    // Chosen: on to the quantity
    if (batch) {
      quantityRef.current?.focus();
    }
  };

  const noBatchesText = () => {
    if (entry.productId == null) {
      return 'اختر الصنف أولاً';
    }
    return againstInvoice ? 'لا توجد تشغيلات لهذا الصنف في الفاتورة' : 'لا توجد تشغيلات لهذا الصنف في المخزن';
  };

  // --- the document ---

  const newReturn = () => {
    doc.openNew();
    entryRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة مرتجع المشتريات رقم ${purchaseReturn.id}؟`)) {
      newReturn();
    }
  };

  const postReturn = async () => {
    await doc.sendToDraft('/post', 'POST');
    // What's left of each batch changed
    await reloadBatches();
  };

  const columnDefs = gridColumns(isPosted, (line) => doc.sendToDraft(`/lines/${line.id}`, 'DELETE'));

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={purchaseReturn ? `مرتجع مشتريات رقم ${purchaseReturn.id}` : 'مرتجع مشتريات جديد'}
        status={documentStatus(purchaseReturn, { newLabel: 'جديد', postedLabel: 'مُرحَّل' })} />
      <HeaderCombobox id={`${formId}-supplier`} label="المورد" basis={220} options={suppliers.options}
        value={header.supplierId} disabled={!editable || againstInvoice} placeholder="اختر المورد…"
        onChange={(supplierId) => doc.changeHeader({ supplierId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={!editable || againstInvoice}
        onChange={(warehouseId) => {
          // Its batches are another warehouse's
          setEntry((previous) => ({ ...previous, batch: null }));
          doc.changeHeader({ warehouseId });
        }} />
      <TextField size="small" label="فاتورة المشتريات" placeholder="بدون" value={invoiceText} disabled={!editable}
        sx={{ flex: '0 1 140px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => setTypedInvoice(event.target.value)} onBlur={enterInvoice} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={suppliers.error ?? warehouses.error ?? products.error}
      headerWarning={entryRow.errors.header} />

    {editable && <EntryRow fieldRefs={[productRef, batchRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={productOptions} value={entry.productId}
        onChange={(productId) => setEntry((previous) => ({ ...previous, productId, batch: null }))}
        error={entryRow.errors.productId} />
      <BatchPicker options={batchOptions} value={entry.batch} inputRef={batchRef} error={entryRow.errors.batch}
        loading={batchesLoading} availableLabel={againstInvoice ? 'متاح للإرجاع' : 'في المخزن'}
        noOptionsText={noBatchesText()} onChange={chooseBatch} />
      <EntryField label="الكمية" kind="numeric" value={entry.quantity} onChange={setField('quantity')}
        inputRef={quantityRef} error={entryRow.errors.quantity} />
      <EntryField label="الخصم %" kind="decimal" placeholder={againstInvoice ? 'من الفاتورة' : '0'}
        disabled={againstInvoice} value={againstInvoice ? '' : entry.discountPercent}
        onChange={setField('discountPercent')} inputRef={discountRef} error={entryRow.errors.discountPercent} />
      <OkButton okRef={okRef} onClick={saveEntry} updating={editingExistingLine} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} isPosted={isPosted} onEdit={editLine}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT : 'أدخل الأصناف المرتجعة: الصنف والتشغيلة والصلاحية والكمية ثم OK'} />

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending}
      nextStep={{ onClick: postReturn, disabled: lines.length === 0 }}
      onDeleteDraft={deleteThisDraft} onNew={newReturn}
      onPrint={purchaseReturn ? () => openPrintout('purchase-return', purchaseReturn.id) : undefined}>
      <Total label="تكلفة البضاعة" value={purchaseReturn ? purchaseReturn.stockValue : '0'} />
      <Total label="فرق السعر" value={purchaseReturn ? purchaseReturn.priceDifference : '0'} />
      <Total label="الصافي" value={purchaseReturn?.netTotal ?? '0'} />
      <Total label="الضريبة" value={purchaseReturn?.vatTotal ?? '0'} />
      {purchaseReturn && isNonZero(purchaseReturn.roundingDifference) &&
        <Total label="فرق التقريب" value={purchaseReturn.roundingDifference} />}
      <Total label="الإجمالي" value={purchaseReturn?.total ?? '0'} strong />
    </DocumentActions>
  </DocumentWindow>;
}
