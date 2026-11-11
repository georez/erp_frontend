'use client';

import { FormControlLabel, Switch } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount, formatDifference, GAIN_COLOR, LOSS_COLOR, NUMBER_CELL } from './document/amounts';
import { BatchesPanel } from './document/BatchesPanel';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions } from './document/DocumentActions';
import { DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow } from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { EntryField, EntryRow, ExpiryField, OkButton, ProductField } from './document/EntryFields';
import {
  checkBatchNumber, checkCountedQuantity, checkExpiry, checkOptionalDiscount, hasErrors, headerProblem, missingProduct,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';

/*
 * The stock adjustment document: the stock counted in one warehouse. Its header (warehouse, description) is typed in
 * and saved as it's left. The entry row sends one batch at a time: a product's batch (its number and expiry date), its
 * counted quantity (whole units) and, for a count above the batch's balance, the discount its extra units cost at. The
 * grid shows the lines as the backend has them, with what posting would do with the batch's stock now: counted above
 * the balance is received at the product's public price less the discount, below it is issued at the average cost.
 * Posting does it and posts the journal entry, the difference on Inventory Adjustments; a posted adjustment can't
 * change. Opening stock is an opening balance (OpeningBalanceForm).
 *
 * While a draft is entered, a floating panel (the header's toggle shows or hides it) lists the batches the warehouse
 * has of the entry row's product, with their quantities; a click on one puts it into the entry row, its quantity as
 * the count, to be changed.
 */

const EMPTY_HEADER = { warehouseId: null, description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', countedQuantity: '', discountPercent: '' };

const headerFrom = (loaded) => ({ warehouseId: loaded.warehouseId, description: loaded.description ?? '' });
const headerBody = (header) => ({ warehouseId: header.warehouseId, description: header.description.trim() || null });

/** The entry row's errors by field, and the line to send when it has none. */
function checkEntry(entry) {
  const batch = checkBatchNumber(entry.batchNumber);
  const expiry = checkExpiry(entry.expiryDate);
  const counted = checkCountedQuantity(entry.countedQuantity);
  // Needed for a count above the batch's balance, which the backend knows
  const discount = checkOptionalDiscount(entry.discountPercent);
  const errors = {
    productId: missingProduct(entry.productId),
    batchNumber: batch.error,
    expiryDate: expiry.error,
    countedQuantity: counted.error,
    discountPercent: discount.error,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  const line = {
    productId: entry.productId,
    batchNumber: batch.number,
    expiryDate: expiry.date,
    countedQuantity: counted.quantity,
    discountPercent: discount.discount,
  };
  return { errors, line };
}

/** A line of the adjustment as the entry row shows it, to change its count or discount. */
const entryFromLine = (line) => ({
  productId: line.productId,
  batchNumber: line.batchNumber,
  expiryDate: formatExpiry(line.expiryDate),
  countedQuantity: line.countedQuantity,
  discountPercent: line.discountPercent ?? '',
});

/** Whether the entry row is one of the lines: OK then replaces it. */
const isOneOfTheLines = (entry, lines) => entry.productId != null && lines.some((line) =>
  line.productId === entry.productId
  && line.batchNumber === entry.batchNumber.trim()
  && formatExpiry(line.expiryDate) === entry.expiryDate);

/** A batch of the panel as the entry row shows it: counted as what the warehouse has, until the count is typed. */
const entryFromBatch = (productId, batch) => ({
  productId,
  batchNumber: batch.batchNumber,
  expiryDate: formatExpiry(batch.expiryDate),
  countedQuantity: batch.quantity,
  discountPercent: '',
});

/** A line whose cost is the average cost: a loss, which always goes at it. */
const isLoss = (line) => Big(line.difference).signum() < 0;

/** The difference's column: +gain in green, -loss in red. */
const differenceColumn = {
  field: 'difference', headerName: 'الفرق', flex: 1, minWidth: 90,
  valueFormatter: ({ value }) => formatDifference(value),
  cellStyle: ({ value }) => {
    const sign = value == null ? 0 : Big(value).signum();
    const color = sign > 0 ? GAIN_COLOR : sign < 0 ? LOSS_COLOR : 'inherit';
    return { ...NUMBER_CELL, color };
  },
};

/**
 * The discount the line's cost is: the one entered for stock counted above the balance, else the average cost's,
 * greyed (a loss always goes at the average).
 */
const costDiscountColumn = {
  field: 'costDiscountPercent', headerName: 'الخصم %', flex: 0.8, minWidth: 80,
  valueFormatter: ({ value }) => formatAmount(value),
  cellStyle: ({ data, node }) => {
    const greyed = !node.rowPinned && isLoss(data);
    return greyed ? { ...NUMBER_CELL, color: '#757575', fontStyle: 'italic' } : NUMBER_CELL;
  },
  tooltipValueGetter: ({ data, node }) => {
    const isAverage = !node.rowPinned && isLoss(data) && data.costDiscountPercent != null;
    return isAverage ? 'خصم متوسط التكلفة' : undefined;
  },
};

/**
 * The value of the difference. A line counted above its balance without a discount (stock taken out since it was
 * saved) has none: posting needs a discount, which the cell asks for. The total has none then either.
 */
const valueColumn = {
  field: 'value', headerName: 'القيمة', flex: 1, minWidth: 100,
  valueFormatter: ({ value, node }) => {
    if (value != null) {
      return formatAmount(value);
    }
    return node.rowPinned ? '—' : 'أدخل الخصم';
  },
  cellStyle: ({ value, node }) => {
    const needsDiscount = value == null && !node.rowPinned;
    return { ...NUMBER_CELL, color: needsDiscount ? LOSS_COLOR : 'inherit' };
  },
};

const gridColumns = (isPosted, onDelete) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  { ...expiryColumn(), valueFormatter: ({ value, node }) => (node.rowPinned ? '' : formatExpiry(value)) },
  amountColumn('publicPrice', 'سعر الجمهور'),
  amountColumn('balanceQuantity', isPosted ? 'الرصيد عند الترحيل' : 'الرصيد الحالي', 100),
  amountColumn('countedQuantity', 'الكمية الفعلية', 100),
  differenceColumn,
  costDiscountColumn,
  amountColumn('unitCost', 'تكلفة الوحدة', 100),
  valueColumn,
  ...deleteColumn(isPosted, onDelete),
];

/**
 * Whether posting would be refused: no lines, a line without a value yet (أدخل الخصم), or no difference to post (every
 * count equals the stock).
 */
const cantPost = (lines) => lines.length === 0 || lines.some((line) => line.value == null)
  || lines.every((line) => Big(line.difference).signum() === 0);

/** The grid's total row: the lines' value added up, exactly (bigdecimal.js); none while a line has no value yet. */
function totalRow(lines) {
  if (lines.length === 0) {
    return [];
  }
  const everyLineHasAValue = lines.every((line) => line.value != null);
  const total = everyLineHasAValue
    ? lines.reduce((sum, line) => sum.add(Big(line.value)), Big(0)).toPlainString()
    : null;
  return [{ id: 'total', productName: 'الإجمالي', value: total }];
}

export default function StockAdjustmentForm({ formId, formTitle, adjustmentId }) {
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const doc = useDocument({
    api: '/api/stock-adjustments', documentId: adjustmentId, formId, formTitle, page: '/dashboard/stock-adjustment',
    idParam: 'adjustmentId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: adjustment, header, editable, isDraft, isPosted } = doc;
  const entryRow = useEntryRow(EMPTY_ENTRY);
  const { entry, setField } = entryRow;
  const [batchesPanelShown, setBatchesPanelShown] = useState(true);

  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const countedRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = useMemo(() => adjustment?.lines ?? [], [adjustment]);
  const productName = products.options.find((option) => option.value === entry.productId)?.label;
  const totals = useMemo(() => totalRow(lines), [lines]);

  /** Sends the line; the row is cleared at once, so the next batch can be typed while it's sent. */
  const saveEntry = () => {
    const headerWarning = doc.isNew ? headerProblem(header) : null;
    const { errors, line } = checkEntry(entry);
    entryRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line, products.labelOf(line.productId));
    // The cursor goes back to the product: Enter moves on to its next batch, typing picks another product
    entryRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  const newAdjustment = () => {
    doc.openNew();
    entryRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة التسوية رقم ${adjustment.id}؟`)) {
      newAdjustment();
    }
  };

  const columnDefs = gridColumns(isPosted, (line) => doc.sendToDraft(`/lines/${line.id}`, 'DELETE'));

  return <DocumentWindow>
    <HeaderRow>
      <DocumentTitle title={adjustment ? `تسوية رقم ${adjustment.id}` : 'تسوية جديدة'}
        status={documentStatus(adjustment, { newLabel: 'جديدة', postedLabel: 'مُرحَّلة' })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={190} options={warehouses.options}
        value={header.warehouseId} disabled={!editable} onChange={(warehouseId) => doc.changeHeader({ warehouseId })} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
      {editable && <FormControlLabel label="التشغيلات" sx={{ flexShrink: 0, mx: 0 }}
        control={<Switch size="small" checked={batchesPanelShown}
          onChange={(event) => setBatchesPanelShown(event.target.checked)} />} />}
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={warehouses.error ?? products.error}
      headerWarning={entryRow.errors.header} />

    {editable && <EntryRow fieldRefs={[productRef, batchRef, expiryRef, countedRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={entry.productId}
        onChange={setField('productId')} error={entryRow.errors.productId} />
      <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')}
        inputRef={batchRef} error={entryRow.errors.batchNumber} minWidth={100} />
      <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
        error={entryRow.errors.expiryDate} />
      <EntryField label="الكمية الفعلية" kind="numeric" value={entry.countedQuantity}
        onChange={setField('countedQuantity')} inputRef={countedRef} error={entryRow.errors.countedQuantity}
        minWidth={110} />
      <EntryField label="الخصم %" kind="decimal" placeholder="للزيادة عن الرصيد" value={entry.discountPercent}
        onChange={setField('discountPercent')} inputRef={discountRef} error={entryRow.errors.discountPercent}
        minWidth={130} />
      <OkButton okRef={okRef} onClick={saveEntry} updating={isOneOfTheLines(entry, lines)} />
    </EntryRow>}

    {editable && <BatchesPanel productId={entry.productId} productName={productName}
      warehouseId={header.warehouseId} shown={batchesPanelShown} chosen={entry}
      onChoose={(batch) => entryRow.fill(entryFromBatch(entry.productId, batch), countedRef)}
      onHide={() => setBatchesPanelShown(false)} />}

    <LinesGrid rows={lines} columnDefs={columnDefs} pinnedBottomRowData={totals} isPosted={isPosted}
      onEdit={(line) => entryRow.fill(entryFromLine(line), countedRef)}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT
        : 'أدخل التشغيلات واحدة واحدة: الصنف والتشغيلة والصلاحية والكمية الفعلية ثم OK'} />

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending}
      nextStep={{ onClick: () => doc.sendToDraft('/post', 'POST'), disabled: cantPost(lines) }}
      onDeleteDraft={deleteThisDraft} onNew={newAdjustment}
      onPrint={adjustment ? () => openPrintout('stock-adjustment', adjustment.id) : undefined} />
  </DocumentWindow>;
}
