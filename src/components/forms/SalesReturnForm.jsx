'use client';

import { TextField } from '@mui/material';
import useSWR from 'swr';
import { useMemo, useRef, useState } from 'react';
import { parseWholeUnits } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import { fetchJson } from '@/utils/fetchJson';
import { formatAmount, isNonZero, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import {
  DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow,
} from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { BatchPicker, EntryField, EntryRow, ExpiryField, OkButton, ProductField } from './document/EntryFields';
import {
  checkBatchNumber, checkExpiry, checkOptionalDiscount, checkQuantity, hasErrors, headerProblem, missingProduct,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';

/*
 * The sales return document: stock a customer sends back.
 *
 * The header is typed in and saved as each field is left. A return may name the posted sales invoice the goods were
 * sold on: when its number is left, the customer and warehouse become the invoice's, the products and batches to
 * choose from are those the invoice took (with what's left to bring back), and each unit is credited at the invoice's
 * amounts and comes back at its cost on the invoice. Without one, a line names its batch (number and expiry date) and
 * is credited at the discount a sale would get (another only for a user who may change discounts); its goods come back
 * at the cost entered as a discount off the public price, or at the warehouse's average.
 *
 * Once the return has lines, its customer, warehouse and invoice stay. Posting puts the goods back into their batches
 * and credits the customer with the total (rounded to 2 decimals).
 */

const EMPTY_HEADER = { customerId: null, warehouseId: null, salesInvoiceId: null, description: '' };
// batch: against an invoice, one of its batches ({ batchNumber, expiryDate, available }); batchNumber and expiryDate:
// without one, typed
const EMPTY_ENTRY = {
  productId: null, batch: null, batchNumber: '', expiryDate: '', quantity: '', discountPercent: '',
  costDiscountPercent: '',
};
const NO_BATCHES = [];

const headerFrom = (loaded) => ({
  customerId: loaded.customerId,
  warehouseId: loaded.warehouseId,
  salesInvoiceId: loaded.salesInvoiceId ?? null,
  description: loaded.description ?? '',
});

const headerBody = (header) => ({
  customerId: header.customerId,
  warehouseId: header.warehouseId,
  salesInvoiceId: header.salesInvoiceId ?? null,
  description: header.description.trim() || null,
});

const invoiceUrl = (id) => `/api/sales-invoices/${id}`;

/** What a new return's header lacks for its first line: the customer, then what every document needs. */
const returnHeaderProblem = (header) => (header.customerId == null ? 'حدّد العميل أولاً' : headerProblem(header));

/** The posted invoice with the number typed: { invoice }, or { error } (not a number, not found, not posted). */
async function loadPostedInvoice(text) {
  const id = parseWholeUnits(text);
  if (id == null) {
    return { error: `رقم فاتورة المبيعات غير صحيح: ${text}` };
  }
  let invoice;
  try {
    invoice = await fetchJson(invoiceUrl(id));
  } catch (loadError) {
    return { error: loadError.message };
  }
  if (invoice.status !== 'POSTED') {
    return { error: `فاتورة المبيعات رقم ${invoice.id} غير مُرحَّلة: المرتجع يكون من فاتورة مُرحَّلة` };
  }
  return { invoice };
}

/** Without an invoice: the discount a sale would give the entry row's product, and the warehouse's average. */
function linePricingUrl(header, productId) {
  if (productId == null || header.customerId == null || header.warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({ customerId: header.customerId, warehouseId: header.warehouseId, productId });
  return `/api/sales-invoices/line-pricing?${params}`;
}

/** Against an invoice: the batches it took the product from, with what's left to bring back. */
function batchOptionsUrl(invoiceId, productId) {
  if (invoiceId == null || productId == null) {
    return null;
  }
  return `/api/sales-returns/batch-options?${new URLSearchParams({ invoiceId, productId })}`;
}

/** The entry row's errors by field, and the line to send when it has none. */
function checkEntry(entry, againstInvoice) {
  const quantity = checkQuantity(entry.quantity);
  const errors = { productId: missingProduct(entry.productId), quantity: quantity.error };
  if (againstInvoice) {
    errors.batch = entry.batch == null ? 'اختر التشغيلة' : null;
    if (hasErrors(errors)) {
      return { errors, line: null };
    }
    return {
      errors,
      line: {
        productId: entry.productId, batchNumber: entry.batch.batchNumber, expiryDate: entry.batch.expiryDate,
        quantity: quantity.quantity, discountPercent: null, costDiscountPercent: null,
      },
    };
  }
  const number = checkBatchNumber(entry.batchNumber);
  const expiry = checkExpiry(entry.expiryDate);
  const discount = checkOptionalDiscount(entry.discountPercent);
  const costDiscount = checkOptionalDiscount(entry.costDiscountPercent);
  Object.assign(errors, {
    batchNumber: number.error, expiryDate: expiry.error, discountPercent: discount.error,
    costDiscountPercent: costDiscount.error,
  });
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  return {
    errors,
    line: {
      productId: entry.productId, batchNumber: number.number, expiryDate: expiry.date, quantity: quantity.quantity,
      discountPercent: discount.discount, costDiscountPercent: costDiscount.discount,
    },
  };
}

/** What the goods cost; unknown (posting refuses it) while there's no average and no cost entered. */
const stockValueColumn = {
  ...amountColumn('stockValue', 'التكلفة', 95),
  valueFormatter: ({ value }) => (value == null ? 'غير معروفة' : formatAmount(value)),
  cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? LOSS_COLOR : 'inherit' }),
};

const gridColumns = ({ againstInvoice, isPosted, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  amountColumn('quantity', 'الكمية', 80),
  amountColumn('publicPrice', 'السعر', 80),
  amountColumn('discountPercent', 'الخصم %', 80),
  amountColumn('netAmount', 'الصافي', 95),
  amountColumn('vatPercent', 'الضريبة %', 80),
  amountColumn('vatAmount', 'الضريبة', 85),
  ...(againstInvoice ? [] : [amountColumn('costDiscountPercent', 'خصم التكلفة %', 95)]),
  stockValueColumn,
  ...deleteColumn(isPosted, onDelete, (row) => `${row.productName} ${row.batchNumber}`),
];

export default function SalesReturnForm({ formId, formTitle, returnId }) {
  const customers = useOptions('customers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const { data: permissions } = useSWR('/api/sales-invoices/permissions', fetchJson);
  const doc = useDocument({
    api: '/api/sales-returns', documentId: returnId, formId, formTitle, page: '/dashboard/sales-return',
    idParam: 'returnId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: salesReturn, header, editable, isDraft, isPosted } = doc;
  const entryRow = useEntryRow(EMPTY_ENTRY);
  const { entry, setEntry, setField } = entryRow;

  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const costDiscountRef = useRef(null);
  const okRef = useRef(null);

  const lines = salesReturn?.lines ?? [];
  const hasLines = lines.length > 0;
  const mayChangeDiscounts = permissions?.mayChangeDiscounts === true;

  // --- the invoice the goods were sold on ---

  const invoiceId = header.salesInvoiceId;
  const againstInvoice = invoiceId != null;
  const { data: invoice } = useSWR(againstInvoice ? invoiceUrl(invoiceId) : null, fetchJson);
  const productOptions = useMemo(() => (againstInvoice
    ? products.options.filter((option) => invoice?.lines.some((line) => line.productId === option.value))
    : products.options), [againstInvoice, invoice, products.options]);

  // The invoice number as typed, until the field is left; then the header's invoice is shown
  const [typedInvoice, setTypedInvoice] = useState(null);
  const headerInvoiceText = invoiceId == null ? '' : String(invoiceId);
  const invoiceText = typedInvoice ?? headerInvoiceText;

  /**
   * The invoice field left: a posted invoice's number makes the return against it, with its customer and warehouse;
   * an empty field makes it against none. Anything else is refused and the field shows the header's again.
   */
  const enterInvoice = async () => {
    const text = invoiceText.trim();
    setTypedInvoice(null);
    if (text === headerInvoiceText) {
      return;
    }
    if (text === '') {
      doc.changeHeader({ salesInvoiceId: null });
      return;
    }
    const { invoice: entered, error } = await loadPostedInvoice(text);
    if (error) {
      doc.setErrorMessage(error);
      return;
    }
    setEntry(EMPTY_ENTRY);
    doc.changeHeader({ salesInvoiceId: entered.id, customerId: entered.customerId, warehouseId: entered.warehouseId });
  };

  // --- the entry row ---

  const { data: batchOptions = NO_BATCHES, isLoading: batchesLoading, mutate: reloadBatches } = useSWR(
    editable && againstInvoice ? batchOptionsUrl(invoiceId, entry.productId) : null, fetchJson);
  const { data: pricing } = useSWR(editable && !againstInvoice ? linePricingUrl(header, entry.productId) : null,
    fetchJson);
  const entryBatchNumber = (againstInvoice ? entry.batch?.batchNumber : entry.batchNumber.trim().toUpperCase()) ?? '';
  const existingLine = lines.find((line) => line.productId === entry.productId && line.batchNumber === entryBatchNumber
    && formatExpiry(line.expiryDate) === (againstInvoice ? formatExpiry(entry.batch?.expiryDate) : entry.expiryDate));
  const discountItGets = existingLine?.discountPercent ?? pricing?.discountPercent ?? null;

  /** Sends the line; the row is cleared at once, but for the product, so the next one can be typed. */
  const saveEntry = () => {
    const headerWarning = doc.isNew ? returnHeaderProblem(header) : null;
    const { errors, line } = checkEntry(entry, againstInvoice);
    entryRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line);
    entryRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  /** A grid row into the entry row, to change it; OK then replaces the line (its discount stays unless typed). */
  const editLine = (line) => entryRow.fill({
    ...EMPTY_ENTRY,
    productId: line.productId,
    batch: againstInvoice ? { batchNumber: line.batchNumber, expiryDate: line.expiryDate } : null,
    batchNumber: line.batchNumber,
    expiryDate: formatExpiry(line.expiryDate),
    quantity: line.quantity,
    costDiscountPercent: line.costDiscountPercent ?? '',
  }, quantityRef);

  const chooseBatch = (batch) => {
    setEntry((previous) => ({ ...previous, batch }));
    if (batch) {
      quantityRef.current?.focus();
    }
  };

  // --- the document ---

  const newReturn = () => {
    doc.openNew();
    entryRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة مرتجع المبيعات رقم ${salesReturn.id}؟`)) {
      newReturn();
    }
  };

  const postReturn = async () => {
    await doc.sendToDraft('/post', 'POST');
    if (againstInvoice) {
      await reloadBatches();
    }
  };

  const columnDefs = gridColumns({
    againstInvoice, isPosted, onDelete: (line) => doc.sendToDraft(`/lines/${line.id}`, 'DELETE'),
  });
  const fieldRefs = againstInvoice
    ? [productRef, batchRef, quantityRef, okRef]
    : [productRef, batchRef, expiryRef, quantityRef, discountRef, costDiscountRef, okRef];

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={salesReturn ? `مرتجع مبيعات رقم ${salesReturn.id}` : 'مرتجع مبيعات جديد'}
        status={documentStatus(salesReturn, { newLabel: 'جديد', postedLabel: 'مُرحَّل' })} />
      <HeaderCombobox id={`${formId}-customer`} label="العميل" basis={220} options={customers.options}
        value={header.customerId} disabled={!editable || againstInvoice || hasLines} placeholder="اختر العميل…"
        onChange={(customerId) => doc.changeHeader({ customerId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={!editable || againstInvoice || hasLines}
        onChange={(warehouseId) => doc.changeHeader({ warehouseId })} />
      <TextField size="small" label="فاتورة المبيعات" placeholder="بدون" value={invoiceText}
        disabled={!editable || hasLines} sx={{ flex: '0 1 140px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => setTypedInvoice(event.target.value)} onBlur={enterInvoice} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={customers.error ?? warehouses.error ?? products.error}
      errorMessage={doc.errorMessage} onCloseError={() => doc.setErrorMessage(null)}
      headerWarning={entryRow.errors.header} />

    {editable && <EntryRow fieldRefs={fieldRefs}>
      <ProductField productRef={productRef} options={productOptions} value={entry.productId}
        onChange={(productId) => setEntry((previous) => ({ ...previous, productId, batch: null }))}
        placeholder={againstInvoice ? 'صنف من الفاتورة…' : undefined} error={entryRow.errors.productId} />
      {againstInvoice
        ? <BatchPicker options={batchOptions} value={entry.batch} inputRef={batchRef} error={entryRow.errors.batch}
          loading={batchesLoading} availableLabel="متاح للإرجاع" onChange={chooseBatch}
          noOptionsText={entry.productId == null ? 'اختر الصنف أولاً' : 'لا يوجد ما يُرجع من هذا الصنف في الفاتورة'} />
        : <>
          <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')}
            inputRef={batchRef} error={entryRow.errors.batchNumber} minWidth={100} />
          <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
            error={entryRow.errors.expiryDate} />
        </>}
      <EntryField label="الكمية" kind="numeric" value={entry.quantity} onChange={setField('quantity')}
        inputRef={quantityRef} error={entryRow.errors.quantity} />
      {!againstInvoice && <>
        <EntryField label="الخصم %" kind="decimal" value={entry.discountPercent} onChange={setField('discountPercent')}
          inputRef={discountRef} disabled={!mayChangeDiscounts} error={entryRow.errors.discountPercent}
          placeholder={discountItGets == null ? undefined : formatAmount(discountItGets)} />
        <EntryField label="خصم التكلفة %" kind="decimal" value={entry.costDiscountPercent}
          onChange={setField('costDiscountPercent')} inputRef={costDiscountRef}
          error={entryRow.errors.costDiscountPercent} placeholder="المتوسط" minWidth={110}
          helperText={pricing ? (pricing.unitCost == null ? 'لا رصيد: أدخله'
            : `المتوسط ${formatAmount(pricing.averageDiscountPercent ?? '0')}%`) : undefined} />
      </>}
      <OkButton okRef={okRef} onClick={saveEntry} updating={existingLine != null} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} isPosted={isPosted} onEdit={editLine}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT : 'أدخل الأصناف المرتجعة: الصنف والتشغيلة والكمية ثم OK'} />

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending}
      nextStep={{ onClick: postReturn, disabled: !hasLines || salesReturn?.stockValue == null }}
      onDeleteDraft={deleteThisDraft} onNew={newReturn}>
      <Total label="التكلفة" value={salesReturn ? salesReturn.stockValue : '0'} />
      <Total label="الصافي" value={salesReturn?.netTotal ?? '0'} />
      <Total label="الضريبة" value={salesReturn?.vatTotal ?? '0'} />
      {salesReturn && isNonZero(salesReturn.roundingDifference) &&
        <Total label="فرق التقريب" value={salesReturn.roundingDifference} />}
      <Total label="الإجمالي" value={salesReturn?.total ?? '0'} strong />
    </DocumentActions>
  </DocumentWindow>;
}
