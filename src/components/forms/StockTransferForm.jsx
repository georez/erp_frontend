'use client';

import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { Alert, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useMemo, useRef } from 'react';
import { fetchJson } from '@/utils/fetchJson';
import { formatAmount, GAIN_COLOR, isNonZero, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import {
  DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow,
} from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { BatchPicker, EntryField, EntryRow, OkButton, ProductField } from './document/EntryFields';
import { checkQuantity, hasErrors, headerProblem, missingProduct } from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/*
 * The stock transfer document: stock moved from one warehouse to another, in one step, at what it costs in the first.
 *
 * 1. The header (the warehouse it's moved from, the one it's moved to, description) is typed in and saved as each
 *    field is left. The first product's OK creates the draft; once it has lines, the warehouses stay.
 * 2. Its products: the entry row sends a product and its quantity, at most what the first warehouse has.
 * 3. Optionally, their batches (إدخال التشغيلات): batches named for some or all of a product's units, from the first
 *    warehouse's. Posting chooses the batches of the other units itself, earliest expiry first, and says which
 *    products those are first.
 *
 * A draft may also be posted straight from its products (ترحيل مباشر). It reserves nothing: when another document
 * takes its stock first, it shows the line as short and can't be posted. A posted transfer can't change; it shows the
 * batches its goods were moved from, which the second warehouse received.
 */

const EMPTY_HEADER = { fromWarehouseId: null, toWarehouseId: null, description: '' };
const EMPTY_LINE = { productId: null, quantity: '' };
// quantityFilled: the quantity is what was left of the product without a batch, filled in (not typed)
const EMPTY_BATCH = { productId: null, batch: null, quantity: '', quantityFilled: false };
const NO_BATCHES = [];

const AUTOMATIC_BATCHES = 'الأقرب انتهاءً أولاً';

const headerFrom = (loaded) => ({
  fromWarehouseId: loaded.fromWarehouseId,
  toWarehouseId: loaded.toWarehouseId,
  description: loaded.description ?? '',
});

const headerBody = (header) => ({
  fromWarehouseId: header.fromWarehouseId,
  toWarehouseId: header.toWarehouseId,
  description: header.description.trim() || null,
});

/** What a new transfer's header lacks for its first line: both warehouses, two different ones. */
function transferHeaderProblem(header) {
  if (header.fromWarehouseId == null) {
    return 'حدّد المخزن المحوَّل منه أولاً';
  }
  if (header.toWarehouseId == null) {
    return 'حدّد المخزن المحوَّل إليه أولاً';
  }
  if (header.fromWarehouseId === header.toWarehouseId) {
    return 'المخزن المحوَّل إليه هو نفسه المحوَّل منه';
  }
  return headerProblem({ warehouseId: header.fromWarehouseId, description: header.description });
}

/** What the first warehouse has of the entry row's product, and what a unit costs there. */
function productStockUrl(productId, warehouseId) {
  if (productId == null || warehouseId == null) {
    return null;
  }
  return `/api/stock-transfers/product-stock?${new URLSearchParams({ productId, warehouseId })}`;
}

/** The batches of the product the first warehouse has, to name for a line. */
function batchOptionsUrl(productId, warehouseId) {
  if (productId == null || warehouseId == null) {
    return null;
  }
  return `/api/stock-transfers/batch-options?${new URLSearchParams({ productId, warehouseId })}`;
}

/** The product entry row's errors by field, and the line to send when it has none. */
function checkLineEntry(entry, available) {
  const quantity = checkQuantity(entry.quantity);
  const overAvailable = quantity.quantity != null && available != null
    && Big(quantity.quantity).compareTo(Big(available)) > 0;
  const errors = {
    productId: missingProduct(entry.productId),
    quantity: quantity.error ?? (overAvailable ? `الرصيد ${formatAmount(available)} فقط` : null),
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  return { errors, line: { productId: entry.productId, quantity: quantity.quantity } };
}

/** The batch entry row's errors by field, and the batch to send when it has none. */
function checkBatchEntry(entry, transferLine) {
  const quantity = checkQuantity(entry.quantity);
  const errors = {
    productId: transferLine ? null : 'حدّد الصنف',
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

/** Whether the line asks for more than the first warehouse has of its product. */
const isShort = (line) => line.available != null && Big(line.quantity).compareTo(Big(line.available)) > 0;

const availableColumn = {
  field: 'available', headerName: 'الرصيد', flex: 1, minWidth: 80,
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
  amountColumn('unitCost', 'تكلفة الوحدة', 90),
  amountColumn('value', 'القيمة', 100),
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

/** The quantities of the lines added up. */
const totalQuantity = (lines) => lines.reduce((total, line) => total.add(Big(line.quantity)), Big(0)).toPlainString();

export default function StockTransferForm({ formId, formTitle, transferId }) {
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const confirm = useConfirm();
  const doc = useDocument({
    api: '/api/stock-transfers', documentId: transferId, formId, formTitle, page: '/dashboard/stock-transfer',
    idParam: 'transferId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: transfer, header, editable, isDraft, isPosted } = doc;
  const lineRow = useEntryRow(EMPTY_LINE);
  const batchRow = useEntryRow(EMPTY_BATCH);

  const productRef = useRef(null);
  const quantityRef = useRef(null);
  const okRef = useRef(null);
  const batchProductRef = useRef(null);
  const batchRef = useRef(null);
  const batchQuantityRef = useRef(null);
  const batchOkRef = useRef(null);

  const lines = useMemo(() => transfer?.lines ?? [], [transfer]);
  const hasLines = lines.length > 0;
  const batchesPhase = transfer != null && transfer.status === 'BATCHES';
  // A posted transfer's batches are those its goods were moved from
  const showsBatches = batchesPhase || isPosted;
  const batchRows = useMemo(() => lines.flatMap((line) => line.batches.map((batch) => ({
    ...batch, lineId: line.id, productId: line.productId, productName: line.productName,
  }))), [lines]);
  const batchProductOptions = useMemo(() => products.options.filter(
    (option) => lines.some((line) => line.productId === option.value)), [products.options, lines]);
  // Stock goes to another warehouse than the one it comes from
  const toWarehouseOptions = useMemo(() => warehouses.options.filter(
    (option) => option.value !== header.fromWarehouseId), [warehouses.options, header.fromWarehouseId]);
  const lineOfProduct = (productId) => lines.find((line) => line.productId === productId);

  // --- phase 1: the products ---

  // Its error is shown under the product, before OK
  const { data: stock, error: stockError } = useSWR(
    editable ? productStockUrl(lineRow.entry.productId, header.fromWarehouseId) : null, fetchJson);
  const existingLine = lineOfProduct(lineRow.entry.productId);
  const stockHelp = stock && `الرصيد ${formatAmount(stock.available)}`
    + (stock.discountPercent ? ` · الخصم المرجح ${formatAmount(stock.discountPercent)}%` : '');

  /** Sends the line; the product stays chosen, the rest is cleared at once. */
  const saveLine = () => {
    const headerWarning = doc.isNew ? transferHeaderProblem(header) : null;
    const { errors, line } = checkLineEntry(lineRow.entry, stock?.available ?? null);
    lineRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line, products.labelOf(line.productId));
    lineRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  /** A product's line into the entry row, to change its quantity. */
  const editLine = (line) => lineRow.fill({ productId: line.productId, quantity: line.quantity }, quantityRef);

  /** Deletes a product's line, with its named batches: asked first when it has some. */
  const deleteLine = async (line) => {
    if (line.batches.length > 0 && !await confirm({
      title: `حذف ${line.productName} وتشغيلاته من التحويل؟`, confirmLabel: 'حذف', color: 'error',
    })) {
      return;
    }
    doc.sendToDraft(`/lines/${line.id}`, 'DELETE');
    batchRow.setEntry((previous) => (previous.productId === line.productId ? EMPTY_BATCH : previous));
  };

  // --- phase 2: the batches ---

  const { data: batchOptions = NO_BATCHES, error: batchOptionsError, isLoading: batchesLoading } = useSWR(
    batchesPhase ? batchOptionsUrl(batchRow.entry.productId, header.fromWarehouseId) : null, fetchJson);

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
  const saveBatch = () => {
    const transferLine = lineOfProduct(batchRow.entry.productId);
    const { errors, batch } = checkBatchEntry(batchRow.entry, transferLine);
    batchRow.setErrors(errors);
    if (!batch) {
      return;
    }
    batchRow.clearKeepingProduct();
    batchProductRef.current?.focus();
    doc.sendToDraft(`/lines/${transferLine.id}/batches`, 'PUT', batch);
  };

  const editBatch = (row) => batchRow.fill({
    productId: row.productId, batch: { batchNumber: row.batchNumber, expiryDate: row.expiryDate },
    quantity: row.quantity, quantityFilled: false,
  }, batchQuantityRef);

  const deleteBatch = (row) => doc.sendToDraft(`/batches/${row.id}`, 'DELETE');

  // --- posting ---

  const shortLines = lines.filter(isShort);

  /** Posts; in the batches phase, once the user confirms that the units without a batch get theirs chosen. */
  const post = async () => {
    const unbatched = batchesPhase ? lines.filter((line) => isNonZero(line.unbatchedQuantity)) : [];
    if (unbatched.length > 0 && !await confirm({
      title: 'ترحيل التحويل؟',
      message: `لم تُحدَّد تشغيلات لكل الكميات؛ ستُختار تشغيلات الباقي تلقائياً (${AUTOMATIC_BATCHES}):\n`
        + listed(unbatched, (line) => formatAmount(line.unbatchedQuantity)),
      confirmLabel: 'ترحيل', color: 'success',
    })) {
      return;
    }
    doc.sendToDraft('/post', 'POST');
  };

  const postDisabled = !hasLines || shortLines.length > 0;

  // --- the document ---

  const newTransfer = () => {
    doc.openNew();
    lineRow.clear();
    batchRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة التحويل المخزني رقم ${transfer.id}؟`)) {
      newTransfer();
    }
  };

  const editingExistingBatch = batchRow.entry.batch != null && batchRows.some((row) =>
    row.productId === batchRow.entry.productId && row.batchNumber === batchRow.entry.batch.batchNumber
    && row.expiryDate === batchRow.entry.batch.expiryDate);

  const status = batchesPhase
    ? { label: 'مسودة · التشغيلات', color: 'info' }
    : documentStatus(transfer, { newLabel: 'جديد', postedLabel: 'مُرحَّل' });
  const nextStep = batchesPhase
    ? { onClick: post, disabled: postDisabled }
    : {
      label: 'إدخال التشغيلات', icon: <PlaylistAddIcon />, disabled: !hasLines,
      onClick: () => doc.sendToDraft('/batches-phase', 'POST'),
    };
  const otherSteps = batchesPhase ? [] : [{ key: 'post', label: 'ترحيل مباشر', onClick: post, disabled: postDisabled }];

  const lineColumnDefs = lineColumns({ batchesPhase, isPosted, onDelete: deleteLine });
  const batchColumnDefs = batchColumns({ isPosted, onDelete: deleteBatch });

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={transfer ? `تحويل مخزني رقم ${transfer.id}` : 'تحويل مخزني جديد'} status={status} />
      <HeaderCombobox id={`${formId}-from`} label="من مخزن" basis={170} options={warehouses.options}
        value={header.fromWarehouseId} disabled={!editable || hasLines}
        onChange={(fromWarehouseId) => doc.changeHeader({ fromWarehouseId })} />
      <HeaderCombobox id={`${formId}-to`} label="إلى مخزن" basis={170} options={toWarehouseOptions}
        value={header.toWarehouseId} disabled={!editable || hasLines} placeholder="اختر المخزن…"
        onChange={(toWarehouseId) => doc.changeHeader({ toWarehouseId })} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={warehouses.error ?? products.error}
      headerWarning={lineRow.errors.header} />
    {isDraft && shortLines.length > 0 && <Alert severity="warning">
      {`الكمية أكبر من رصيد المخزن المحوَّل منه: ${shortLines.map((line) => line.productName).join('، ')}. `
        + 'قلّل الكمية أو احذف الصنف قبل الترحيل'}
    </Alert>}

    {/* Phase 1, the products: one at a time; Enter moves to the next field */}
    {editable && <EntryRow fieldRefs={[productRef, quantityRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={lineRow.entry.productId}
        onChange={lineRow.setField('productId')} error={lineRow.errors.productId ?? stockError?.message} />
      <EntryField label="الكمية" kind="numeric" value={lineRow.entry.quantity} onChange={lineRow.setField('quantity')}
        inputRef={quantityRef} error={lineRow.errors.quantity} helperText={stockHelp || undefined} minWidth={150} />
      <OkButton okRef={okRef} onClick={saveLine} updating={existingLine != null} />
    </EntryRow>}
    <LinesGrid rows={lines} columnDefs={lineColumnDefs} isPosted={isPosted} onEdit={editLine} minHeight={120}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT : 'أدخل أصناف التحويل: الصنف والكمية ثم OK'} />

    {/* Phase 2, optional: batches named for the products' units */}
    {showsBatches && <>
      <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
        {isPosted ? 'التشغيلات المحوَّلة' : 'التشغيلات'}
      </Typography>
      {isDraft && <EntryRow fieldRefs={[batchProductRef, batchRef, batchQuantityRef, batchOkRef]}>
        <ProductField productRef={batchProductRef} options={batchProductOptions} value={batchRow.entry.productId}
          onChange={chooseBatchProduct} placeholder="صنف من التحويل…" error={batchRow.errors.productId} />
        <BatchPicker options={batchOptions} value={batchRow.entry.batch} inputRef={batchRef}
          error={batchRow.errors.batch} loading={batchesLoading} loadError={batchOptionsError} availableLabel="الرصيد"
          onChange={chooseBatch}
          noOptionsText={batchRow.entry.productId == null ? 'اختر الصنف أولاً' : 'لا توجد تشغيلات لهذا الصنف في المخزن'} />
        <EntryField label="الكمية" kind="numeric" value={batchRow.entry.quantity}
          onChange={(quantity) => batchRow.setEntry((previous) => ({ ...previous, quantity, quantityFilled: false }))}
          inputRef={batchQuantityRef} error={batchRow.errors.quantity} />
        <OkButton okRef={batchOkRef} onClick={saveBatch} updating={editingExistingBatch} />
      </EntryRow>}
      <LinesGrid rows={batchRows} columnDefs={batchColumnDefs} isPosted={isPosted} onEdit={editBatch} minHeight={100}
        emptyText={`حدّد تشغيلات ما تريد من الأصناف ثم OK؛ تُختار تشغيلات الباقي عند الترحيل (${AUTOMATIC_BATCHES})`} />
    </>}

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending} nextStep={nextStep}
      otherSteps={otherSteps} onDeleteDraft={deleteThisDraft} onNew={newTransfer}
      onPrint={transfer ? () => openPrintout('stock-transfer', transfer.id) : undefined}>
      <Total label="إجمالي الكمية" value={totalQuantity(lines)} />
      <Total label="القيمة بالتكلفة" value={transfer?.valueTotal ?? (hasLines ? null : '0')} strong />
    </DocumentActions>
  </DocumentWindow>;
}
