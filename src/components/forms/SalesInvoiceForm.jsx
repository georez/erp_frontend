'use client';

import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { Alert, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useMemo, useRef } from 'react';
import { parsePercent } from '@/utils/decimals';
import { fetchJson } from '@/utils/fetchJson';
import { formatAmount, GAIN_COLOR, isNonZero, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import {
  DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow,
} from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { BatchPicker, EntryField, EntryRow, OkButton, ProductField } from './document/EntryFields';
import {
  checkOptionalDiscount, checkQuantity, hasErrors, headerProblem, missingProduct, underMinimumQuestion,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/*
 * The sales invoice document: stock sold to a customer, on credit.
 *
 * 1. The header (customer, warehouse, description) is typed in and saved as each field is left. The first product's
 *    OK creates the draft; once it has lines, the customer and the warehouse stay (its lines were priced and reserved
 *    for them).
 * 2. Its products: the entry row sends a product and its quantity. The discount is worked out by the backend (the
 *    product's average discount less the customer's tier's) and recorded; a user who may change discounts may type
 *    another. A discount under the product's minimum is asked about first. A draft reserves its lines: the quantity
 *    shows what's free to sell.
 * 3. Optionally, their batches (إدخال التشغيلات): batches named for some or all of a product's units, from the
 *    warehouse's, each with what's free of it. Posting chooses the batches of the other units itself (FEFO or LIFO, in
 *    الإعدادات), and says which products those are first.
 *
 * Posting straight from the products, without the batches phase, is for users who may. It's refused when the
 * customer's balance plus the total goes over their credit limit, and warns first about lines sold under their cost.
 * A posted invoice can't change; it shows the batches its goods were taken from.
 */

const EMPTY_HEADER = { customerId: null, warehouseId: null, description: '' };
const EMPTY_LINE = { productId: null, quantity: '', discountPercent: '' };
// quantityFilled: the quantity is what was left of the product without a batch, filled in (not typed)
const EMPTY_BATCH = { productId: null, batch: null, quantity: '', quantityFilled: false };
const NO_BATCHES = [];

const BATCH_ORDER_LABELS = { FEFO: 'الأقرب انتهاءً أولاً', LIFO: 'آخر وارد أولاً' };

const headerFrom = (loaded) => ({
  customerId: loaded.customerId,
  warehouseId: loaded.warehouseId,
  description: loaded.description ?? '',
});

const headerBody = (header) => ({
  customerId: header.customerId,
  warehouseId: header.warehouseId,
  description: header.description.trim() || null,
});

/** What a new invoice's header lacks for its first line: the customer, then what every document needs. */
const salesHeaderProblem = (header) => (header.customerId == null ? 'حدّد العميل أولاً' : headerProblem(header));

/** The discount and stock the backend works out for the entry row's product, before it's sent. */
function linePricingUrl(header, productId, invoiceId) {
  if (productId == null || header.customerId == null || header.warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({
    customerId: header.customerId, warehouseId: header.warehouseId, productId,
  });
  if (invoiceId != null) {
    params.set('invoiceId', invoiceId);
  }
  return `/api/sales-invoices/line-pricing?${params}`;
}

/** The batches of the product that may be named for a line, each with what's free of it. */
function batchOptionsUrl(productId, warehouseId, invoiceId) {
  if (productId == null || warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({ productId, warehouseId, invoiceId });
  return `/api/sales-invoices/batch-options?${params}`;
}

/** What a unit sells for at the discount: price × (100 − discount) ÷ 100. */
const unitPriceAt = (publicPrice, discountPercent) =>
  Big(publicPrice).multiply(Big(100).subtract(Big(discountPercent))).divide(Big(100));

/** The product entry row's errors by field, and the line to send when it has none. */
function checkLineEntry(entry, available) {
  const quantity = checkQuantity(entry.quantity);
  const discount = checkOptionalDiscount(entry.discountPercent);
  const overAvailable = quantity.quantity != null && available != null
    && Big(quantity.quantity).compareTo(Big(available)) > 0;
  const errors = {
    productId: missingProduct(entry.productId),
    quantity: quantity.error ?? (overAvailable ? `المتاح ${formatAmount(available)} فقط` : null),
    discountPercent: discount.error,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  return {
    errors,
    line: { productId: entry.productId, quantity: quantity.quantity, discountPercent: discount.discount },
  };
}

/** The batch entry row's errors by field, and the batch to send when it has none. */
function checkBatchEntry(entry, invoiceLine) {
  const quantity = checkQuantity(entry.quantity);
  const errors = {
    productId: invoiceLine ? null : 'حدّد الصنف',
    batch: entry.batch ? null : 'اختر التشغيلة',
    quantity: quantity.error,
  };
  if (hasErrors(errors)) {
    return { errors, batch: null };
  }
  return {
    errors,
    batch: { batchNumber: entry.batch.batchNumber, expiryDate: entry.batch.expiryDate, quantity: quantity.quantity },
  };
}

/** Whether the line asks for more than the warehouse has free of its product. */
const isShort = (line) => line.available != null && Big(line.quantity).compareTo(Big(line.available)) > 0;

const unitPriceColumn = {
  field: 'unitPrice', headerName: 'سعر الوحدة', flex: 1, minWidth: 90,
  valueFormatter: ({ value }) => formatAmount(value),
  cellStyle: ({ data }) => ({ ...NUMBER_CELL, ...(data.belowCost && { color: LOSS_COLOR, fontWeight: 700 }) }),
  tooltipValueGetter: ({ data }) => (data.belowCost ? 'تحت التكلفة' : undefined),
};

const availableColumn = {
  field: 'available', headerName: 'المتاح', flex: 1, minWidth: 80,
  valueFormatter: ({ value }) => formatAmount(value),
  cellStyle: ({ data }) => ({ ...NUMBER_CELL, ...(isShort(data) && { color: LOSS_COLOR, fontWeight: 700 }) }),
};

const batchedColumn = {
  field: 'unbatchedQuantity', headerName: 'بدون تشغيلة', flex: 1, minWidth: 90,
  valueFormatter: ({ value }) => formatAmount(value),
  cellStyle: ({ data }) => ({ ...NUMBER_CELL, color: isNonZero(data.unbatchedQuantity) ? LOSS_COLOR : GAIN_COLOR }),
};

const lineColumns = ({ batchesPhase, isPosted, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  amountColumn('quantity', 'الكمية', 80),
  ...(isPosted ? [] : [availableColumn]),
  ...(batchesPhase && !isPosted ? [batchedColumn] : []),
  amountColumn('publicPrice', 'سعر الجمهور', 85),
  amountColumn('discountPercent', 'الخصم %', 80),
  unitPriceColumn,
  amountColumn('unitCost', 'تكلفة الوحدة', 90),
  amountColumn('netAmount', 'الصافي', 95),
  amountColumn('vatPercent', 'الضريبة %', 80),
  amountColumn('vatAmount', 'الضريبة', 85),
  ...deleteColumn(isPosted, onDelete),
];

const batchColumns = ({ isPosted, onDelete }) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  amountColumn('quantity', 'الكمية', 85),
  ...deleteColumn(isPosted, onDelete, (row) => `${row.productName} ${row.batchNumber}`),
];

/** "name: what" for each line, one per line of the message. */
const listed = (lines, what) => lines.map((line) => `- ${line.productName}: ${what(line)}`).join('\n');

export default function SalesInvoiceForm({ formId, formTitle, invoiceId }) {
  const customers = useOptions('customers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const { data: permissions } = useSWR('/api/sales-invoices/permissions', fetchJson);
  const { data: settings } = useSWR('/api/settings', fetchJson);
  const confirm = useConfirm();
  const doc = useDocument({
    api: '/api/sales-invoices', documentId: invoiceId, formId, formTitle, page: '/dashboard/sales-invoice',
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
  const batchRef = useRef(null);
  const batchQuantityRef = useRef(null);
  const batchOkRef = useRef(null);

  const lines = useMemo(() => invoice?.lines ?? [], [invoice]);
  const hasLines = lines.length > 0;
  const batchesPhase = invoice != null && invoice.status === 'BATCHES';
  // A posted invoice's batches are those its goods were taken from
  const showsBatches = batchesPhase || isPosted;
  const batchRows = useMemo(() => lines.flatMap((line) => line.batches.map((batch) => ({
    ...batch, lineId: line.id, productId: line.productId, productName: line.productName,
  }))), [lines]);
  const batchProductOptions = useMemo(() => products.options.filter(
    (option) => lines.some((line) => line.productId === option.value)), [products.options, lines]);
  const lineOfProduct = (productId) => lines.find((line) => line.productId === productId);
  const mayChangeDiscounts = permissions?.mayChangeDiscounts === true;
  const batchOrderLabel = BATCH_ORDER_LABELS[settings?.salesBatchOrder] ?? BATCH_ORDER_LABELS.FEFO;

  // --- phase 1: the products ---

  // Its error (e.g. the warehouse gives the customer's tier no discount) is shown under the product, before OK
  const { data: pricing, error: pricingError } = useSWR(
    editable ? linePricingUrl(header, lineRow.entry.productId, invoice?.id) : null,
    fetchJson);
  const existingLine = lineOfProduct(lineRow.entry.productId);
  // What the line gets without a discount typed: its own, or the one worked out for a new line
  const discountItGets = existingLine?.discountPercent ?? pricing?.discountPercent ?? null;
  const productOption = products.options.find((option) => option.value === lineRow.entry.productId);
  const discountShown = parsePercent(lineRow.entry.discountPercent) ? lineRow.entry.discountPercent : discountItGets;
  const entryBelowCost = productOption?.detail != null && discountShown != null && pricing?.unitCost != null
    && unitPriceAt(productOption.detail, discountShown).compareTo(Big(pricing.unitCost)) < 0;
  const discountHelp = pricing && `المتوسط ${formatAmount(pricing.averageDiscountPercent ?? '0')} − الشريحة `
    + `${formatAmount(pricing.tierDiscountPercent)}`
    + (pricing.minimumDiscountPercent ? ` · الحد الأدنى ${formatAmount(pricing.minimumDiscountPercent)}` : '');

  /** Sends the line, asking first about a discount under the minimum; the product stays, the rest is cleared. */
  const saveLine = async () => {
    const headerWarning = doc.isNew ? salesHeaderProblem(header) : null;
    const { errors, line } = checkLineEntry(lineRow.entry, pricing?.available ?? null);
    lineRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    const question = underMinimumQuestion(line.discountPercent ?? discountItGets,
      pricing?.minimumDiscountPercent ?? null, products.labelOf(line.productId));
    if (question && !await confirm(question)) {
      discountRef.current?.focus();
      return;
    }
    doc.addLine(line, products.labelOf(line.productId));
    lineRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  /** A product's line into the entry row, to change its quantity; its discount stays unless another is typed. */
  const editLine = (line) => lineRow.fill({ productId: line.productId, quantity: line.quantity, discountPercent: '' },
    quantityRef);

  /** Deletes a product's line, with its named batches: asked first when it has some. */
  const deleteLine = async (line) => {
    if (line.batches.length > 0 && !await confirm({
      title: `حذف ${line.productName} وتشغيلاته من الفاتورة؟`, confirmLabel: 'حذف', color: 'error',
    })) {
      return;
    }
    doc.sendToDraft(`/lines/${line.id}`, 'DELETE');
    batchRow.setEntry((previous) => (previous.productId === line.productId ? EMPTY_BATCH : previous));
  };

  // --- phase 2: the batches ---

  const {
    data: batchOptions = NO_BATCHES, error: batchOptionsError, isLoading: batchesLoading, mutate: reloadBatches,
  } = useSWR(batchesPhase ? batchOptionsUrl(batchRow.entry.productId, header.warehouseId, invoice.id) : null,
    fetchJson);

  /** The batch row's product: its units without a batch as the quantity, unless one is typed. */
  const chooseBatchProduct = (productId) => batchRow.setEntry((previous) => {
    const quantityTyped = previous.quantity !== '' && !previous.quantityFilled;
    const left = lineOfProduct(productId)?.unbatchedQuantity ?? '0';
    const filled = !quantityTyped && Big(left).signum() > 0;
    return {
      ...previous, productId, batch: null,
      ...(!quantityTyped && { quantity: filled ? left : '', quantityFilled: filled }),
    };
  });

  const chooseBatch = (batch) => {
    batchRow.setEntry((previous) => ({ ...previous, batch }));
    if (batch) {
      batchQuantityRef.current?.focus();
    }
  };

  /** Sends the batch; the row keeps its product and is otherwise cleared at once. */
  const saveBatch = async () => {
    const invoiceLine = lineOfProduct(batchRow.entry.productId);
    const { errors, batch } = checkBatchEntry(batchRow.entry, invoiceLine);
    batchRow.setErrors(errors);
    if (!batch) {
      return;
    }
    batchRow.clearKeepingProduct();
    batchProductRef.current?.focus();
    await doc.sendToDraft(`/lines/${invoiceLine.id}/batches`, 'PUT', batch);
    // What's free of the batch changed
    await reloadBatches();
  };

  const editBatch = (row) => batchRow.fill({
    productId: row.productId, batch: { batchNumber: row.batchNumber, expiryDate: row.expiryDate },
    quantity: row.quantity, quantityFilled: false,
  }, batchQuantityRef);

  const deleteBatch = async (row) => {
    await doc.sendToDraft(`/batches/${row.id}`, 'DELETE');
    await reloadBatches();
  };

  // --- posting ---

  const shortLines = lines.filter(isShort);
  const belowCostLines = lines.filter((line) => line.belowCost);
  const overCreditLimit = invoice?.overCreditLimit === true;

  /**
   * Posts once the user confirms what posting would do that they may not expect: in the batches phase, the units
   * without a batch get theirs chosen; and lines sold under their cost.
   */
  const post = async () => {
    const warnings = [];
    const unbatched = batchesPhase ? lines.filter((line) => isNonZero(line.unbatchedQuantity)) : [];
    if (unbatched.length > 0) {
      warnings.push(`لم تُحدَّد تشغيلات لكل الكميات؛ ستُختار تشغيلات الباقي تلقائياً (${batchOrderLabel}):\n`
        + listed(unbatched, (line) => formatAmount(line.unbatchedQuantity)));
    }
    if (belowCostLines.length > 0) {
      warnings.push('أصناف تُباع بأقل من تكلفتها:\n'
        + listed(belowCostLines, (line) => `سعر الوحدة ${formatAmount(line.unitPrice)}، التكلفة ${formatAmount(line.unitCost)}`));
    }
    if (warnings.length > 0 && !await confirm({
      title: 'ترحيل الفاتورة؟', message: warnings.join('\n\n'), confirmLabel: 'ترحيل', color: 'success',
    })) {
      return;
    }
    doc.sendToDraft('/post', 'POST');
  };

  const postDisabled = !hasLines || overCreditLimit || shortLines.length > 0;

  // --- the document ---

  const newInvoice = () => {
    doc.openNew();
    lineRow.clear();
    batchRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة فاتورة المبيعات رقم ${invoice.id}؟`)) {
      newInvoice();
    }
  };

  const editingExistingBatch = batchRow.entry.batch != null && batchRows.some((row) =>
    row.productId === batchRow.entry.productId && row.batchNumber === batchRow.entry.batch.batchNumber
    && row.expiryDate === batchRow.entry.batch.expiryDate);

  const status = batchesPhase
    ? { label: 'مسودة · التشغيلات', color: 'info' }
    : documentStatus(invoice, { newLabel: 'جديدة', postedLabel: 'مُرحَّلة' });
  const nextStep = batchesPhase
    ? { onClick: post, disabled: postDisabled }
    : {
      label: 'إدخال التشغيلات', icon: <PlaylistAddIcon />, disabled: !hasLines,
      onClick: () => doc.sendToDraft('/batches-phase', 'POST'),
    };
  const otherSteps = !batchesPhase && permissions?.mayPostWithoutBatches
    ? [{ key: 'post', label: 'ترحيل مباشر', onClick: post, disabled: postDisabled }]
    : [];

  const balanceAfter = invoice && Big(invoice.customerBalance).add(Big(invoice.total)).toPlainString();

  const lineColumnDefs = lineColumns({ batchesPhase, isPosted, onDelete: deleteLine });
  const batchColumnDefs = batchColumns({ isPosted, onDelete: deleteBatch });

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={invoice ? `فاتورة مبيعات رقم ${invoice.id}` : 'فاتورة مبيعات جديدة'} status={status} />
      <HeaderCombobox id={`${formId}-customer`} label="العميل" basis={220} options={customers.options}
        value={header.customerId} disabled={!editable || hasLines} placeholder="اختر العميل…"
        onChange={(customerId) => doc.changeHeader({ customerId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={!editable || hasLines}
        onChange={(warehouseId) => doc.changeHeader({ warehouseId })} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    {invoice && !isPosted && <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
      رصيد العميل <bdi style={{ direction: 'ltr' }}>{formatAmount(invoice.customerBalance)}</bdi>
      {' · '}بعد الفاتورة <bdi style={{ direction: 'ltr' }}>{formatAmount(balanceAfter)}</bdi>
      {' · '}حد الائتمان <bdi style={{ direction: 'ltr' }}>{formatAmount(invoice.creditLimit)}</bdi>
    </Typography>}

    <DocumentAlerts loadError={doc.loadError} optionsError={customers.error ?? warehouses.error ?? products.error}
      headerWarning={lineRow.errors.header} />
    {isDraft && overCreditLimit && <Alert severity="warning">
      {`رصيد العميل مع هذه الفاتورة (${formatAmount(balanceAfter)}) يتجاوز حد الائتمان `
        + `(${formatAmount(invoice.creditLimit)}): لا يمكن ترحيلها`}
    </Alert>}
    {isDraft && shortLines.length > 0 && <Alert severity="warning">
      {`الكمية أكبر من المتاح للبيع: ${shortLines.map((line) => line.productName).join('، ')}. `
        + 'قلّل الكمية أو احذف الصنف قبل الترحيل'}
    </Alert>}
    {isDraft && belowCostLines.length > 0 && <Alert severity="info">
      {`تُباع بأقل من تكلفتها: ${belowCostLines.map((line) => line.productName).join('، ')}`}
    </Alert>}

    {/* Phase 1, the products: one at a time; Enter moves to the next field */}
    {editable && <EntryRow fieldRefs={[productRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={lineRow.entry.productId}
        onChange={lineRow.setField('productId')} error={lineRow.errors.productId ?? pricingError?.message} />
      <EntryField label="الكمية" kind="numeric" value={lineRow.entry.quantity} onChange={lineRow.setField('quantity')}
        inputRef={quantityRef} error={lineRow.errors.quantity}
        helperText={pricing ? `المتاح ${formatAmount(pricing.available)}` : undefined} />
      <EntryField label="الخصم %" kind="decimal" value={lineRow.entry.discountPercent}
        onChange={lineRow.setField('discountPercent')} inputRef={discountRef} disabled={!mayChangeDiscounts}
        placeholder={discountItGets == null ? undefined : formatAmount(discountItGets)} minWidth={150}
        error={lineRow.errors.discountPercent ?? (entryBelowCost ? 'تحت التكلفة' : null)}
        helperText={discountHelp || undefined} />
      <OkButton okRef={okRef} onClick={saveLine} updating={existingLine != null} />
    </EntryRow>}
    <LinesGrid rows={lines} columnDefs={lineColumnDefs} isPosted={isPosted} onEdit={editLine} minHeight={120}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT : 'أدخل أصناف الفاتورة: الصنف والكمية ثم OK'} />

    {/* Phase 2, optional: batches named for the products' units */}
    {showsBatches && <>
      <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
        {isPosted ? 'التشغيلات المسحوبة' : 'التشغيلات'}
      </Typography>
      {isDraft && <EntryRow fieldRefs={[batchProductRef, batchRef, batchQuantityRef, batchOkRef]}>
        <ProductField productRef={batchProductRef} options={batchProductOptions} value={batchRow.entry.productId}
          onChange={chooseBatchProduct} placeholder="صنف من الفاتورة…" error={batchRow.errors.productId} />
        <BatchPicker options={batchOptions} value={batchRow.entry.batch} inputRef={batchRef}
          error={batchRow.errors.batch} loading={batchesLoading} loadError={batchOptionsError} availableLabel="متاح"
          onChange={chooseBatch}
          noOptionsText={batchRow.entry.productId == null ? 'اختر الصنف أولاً' : 'لا توجد تشغيلات متاحة لهذا الصنف'} />
        <EntryField label="الكمية" kind="numeric" value={batchRow.entry.quantity}
          onChange={(quantity) => batchRow.setEntry((previous) => ({ ...previous, quantity, quantityFilled: false }))}
          inputRef={batchQuantityRef} error={batchRow.errors.quantity} />
        <OkButton okRef={batchOkRef} onClick={saveBatch} updating={editingExistingBatch} />
      </EntryRow>}
      <LinesGrid rows={batchRows} columnDefs={batchColumnDefs} isPosted={isPosted} onEdit={editBatch} minHeight={100}
        emptyText={`حدّد تشغيلات ما تريد من الأصناف ثم OK؛ تُختار تشغيلات الباقي عند الترحيل (${batchOrderLabel})`} />
    </>}

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending} nextStep={nextStep}
      otherSteps={otherSteps} onDeleteDraft={deleteThisDraft} onNew={newInvoice}
      onPrint={invoice ? () => openPrintout('sales-invoice', invoice.id) : undefined}>
      <Total label="التكلفة" value={invoice?.costTotal ?? null} />
      <Total label="الصافي" value={invoice?.netTotal ?? '0'} />
      <Total label="الضريبة" value={invoice?.vatTotal ?? '0'} />
      {invoice && isNonZero(invoice.roundingDifference) &&
        <Total label="فرق التقريب" value={invoice.roundingDifference} />}
      <Total label="الإجمالي" value={invoice?.total ?? '0'} strong />
    </DocumentActions>
  </DocumentWindow>;
}
