'use client';

import { Alert, Box, Stack } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDecimal, normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import {
  amountColumn, checkBatchNumber, checkExpiry, deleteColumn, DescriptionField, DISCOUNT_ERROR, DocumentActions,
  documentStatus, DocumentTitle, EntryField, EntryRow, expiryColumn, ExpiryField, formatAmount, HeaderCombobox,
  LinesGrid, MAX_DESCRIPTION_LENGTH, NUMBER_CELL, OkButton, ProductField, REQUIRED, useDocument, useOptions,
} from './documentForm';

const EMPTY_HEADER = { warehouseId: null, description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', countedQuantity: '', discountPercent: '' };

/** A line whose cost is the average cost: a loss, which always goes at it. */
const isAverageCost = (line) => Big(line.difference).signum() < 0;

/**
 * The stock adjustment document: the stock counted in one warehouse. A draft is filled one batch at a time: the
 * entry row sends a product's batch (its number and expiry date), its counted quantity (whole units: the products are
 * pharmaceuticals) and, for a count above the batch's balance, the discount its extra units cost at, to the backend
 * (OK), and the grid shows the lines as the backend has them, with what posting would do with the batch's stock now:
 * counted above the balance is received at the product's public price less the discount, below it is issued at the
 * average cost. Posting does it and posts the journal entry, the difference on Inventory Adjustments; a posted
 * adjustment can't change. Opening stock is an opening balance (OpeningBalanceForm).
 */
export default function StockAdjustmentForm({ formId, formTitle, adjustmentId }) {
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const {
    document: adjustment, loadError, header, changeHeader, saveTextOnBlur, busy, errorMessage, setErrorMessage, posted,
    saveToDraft, request, openNew, deleteDraft,
  } = useDocument({
    api: '/api/stock-adjustments', documentId: adjustmentId, formId, formTitle, page: '/dashboard/stock-adjustment',
    idParam: 'adjustmentId', emptyHeader: EMPTY_HEADER,
    headerFrom: (loaded) => ({ warehouseId: loaded.warehouseId, description: loaded.description ?? '' }),
    headerBody: (next) => ({ warehouseId: next.warehouseId, description: next.description.trim() || null }),
  });

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const countedRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = useMemo(() => adjustment?.lines ?? [], [adjustment]);
  const optionsError = warehouses.error ?? products.error;
  const setField = (field) => (value) => setEntry((previous) => ({ ...previous, [field]: value }));

  const saveEntry = async () => {
    const counted = parseWholeUnits(entry.countedQuantity);
    const batch = checkBatchNumber(entry.batchNumber);
    const expiry = checkExpiry(entry.expiryDate);
    // Needed for a count above the batch's balance, which the backend knows
    const discountEntered = entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      warehouseId: header.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: batch.error,
      expiryDate: expiry.error,
      countedQuantity: entry.countedQuantity.trim() === '' ? REQUIRED
        : counted != null ? null : 'عدد صحيح من الوحدات',
      discountPercent: discountEntered && !discount ? DISCOUNT_ERROR : null,
    };
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }
    // As text, so no number passes through a JavaScript number
    const saved = await saveToDraft('/lines', {
      productId: entry.productId,
      batchNumber: batch.number,
      expiryDate: expiry.date,
      countedQuantity: counted,
      discountPercent: discountEntered ? normalizeDecimalText(entry.discountPercent) : null,
    });
    if (saved) {
      // The product stays selected (its next batch is often counted next); the cursor goes back to it, where Enter
      // moves on to the batch, and typing picks another product
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const newAdjustment = () => {
    openNew();
    setEntry(EMPTY_ENTRY);
    setEntryErrors({});
  };

  /** A grid row into the entry row, to change its count or discount; OK then replaces the line. */
  const editLine = (line) => {
    // Rendered at once (the grid calls this from its own listener, where React would render later), so the count is
    // in its field before it's selected, and typing replaces it instead of adding to it
    flushSync(() => {
      setEntry({
        productId: line.productId, batchNumber: line.batchNumber, expiryDate: formatExpiry(line.expiryDate),
        countedQuantity: line.countedQuantity, discountPercent: line.discountPercent ?? '',
      });
      setEntryErrors({});
    });
    countedRef.current?.focus();
    countedRef.current?.select();
  };
  const editingExistingLine = entry.productId != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batchNumber.trim() && formatExpiry(line.expiryDate) === entry.expiryDate);

  // Rebuilt every render: the delete buttons need the current adjustment and busy state, and the grid only
  // redraws the cells whose values changed
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    { field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110 },
    { ...expiryColumn(), valueFormatter: ({ value, node }) => (node.rowPinned ? '' : formatExpiry(value)) },
    amountColumn('publicPrice', 'سعر الجمهور'),
    amountColumn('balanceQuantity', posted ? 'الرصيد عند الترحيل' : 'الرصيد الحالي', 100),
    amountColumn('countedQuantity', 'الكمية الفعلية', 100),
    {
      field: 'difference', headerName: 'الفرق', flex: 1, minWidth: 90,
      valueFormatter: ({ value }) => (value == null ? ''
        : `${Big(value).signum() > 0 ? '+' : ''}${formatDecimal(Big(value))}`),
      cellStyle: ({ value }) => {
        const sign = value == null ? 0 : Big(value).signum();
        return { ...NUMBER_CELL, color: sign > 0 ? '#2e7d32' : sign < 0 ? '#c62828' : 'inherit' };
      },
    },
    {
      // The discount the line's cost is: the one entered for stock counted above the balance, else the average
      // cost's, shown greyed (a loss always goes at the average)
      field: 'costDiscountPercent', headerName: 'الخصم %', flex: 0.8, minWidth: 80,
      valueFormatter: ({ value }) => formatAmount(value),
      cellStyle: ({ data, node }) => ({
        ...NUMBER_CELL,
        ...(!node.rowPinned && isAverageCost(data) && { color: '#757575', fontStyle: 'italic' }),
      }),
      tooltipValueGetter: ({ data, node }) => (!node.rowPinned && isAverageCost(data) && data.costDiscountPercent != null
        ? 'خصم متوسط التكلفة' : undefined),
    },
    amountColumn('unitCost', 'تكلفة الوحدة', 100),
    {
      field: 'value', headerName: 'القيمة', flex: 1, minWidth: 100,
      // Counted above the balance without a discount (stock taken out since the line was saved): posting needs one
      valueFormatter: ({ value }) => (value == null ? 'أدخل الخصم' : formatAmount(value)),
      cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? '#c62828' : 'inherit' }),
    },
    ...deleteColumn(posted, busy, (line) => request(`/lines/${line.id}`, 'DELETE')),
  ];

  // The total value, exact (bigdecimal.js); none while a line has no value yet
  const totalRow = useMemo(() => (lines.length === 0 ? [] : [{
    id: 'total',
    productName: 'الإجمالي',
    value: lines.every((line) => line.value != null)
      ? lines.reduce((sum, line) => sum.add(Big(line.value)), Big(0)).toPlainString()
      : null,
  }]), [lines]);

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header: one line */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexShrink: 0 }}>
      <DocumentTitle title={adjustment ? `تسوية رقم ${adjustment.id}` : 'تسوية جديدة'}
        status={documentStatus(adjustment, { newLabel: 'جديدة', postedLabel: 'مُرحَّلة' })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={190} options={warehouses.options}
        value={header.warehouseId} disabled={posted || busy} onChange={(warehouseId) => changeHeader({ warehouseId })} />
      <DescriptionField value={header.description} disabled={posted}
        onChange={(description) => changeHeader({ description }, false)}
        onBlur={saveTextOnBlur('description', adjustment?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.warehouseId && <Alert severity="warning">{entryErrors.warehouseId}</Alert>}

    {/* Entry row: one batch at a time; Enter moves to the next field */}
    {!posted && <EntryRow fieldRefs={[productRef, batchRef, expiryRef, countedRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={entry.productId}
        onChange={setField('productId')} error={entryErrors.productId} />
      <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')} inputRef={batchRef}
        error={entryErrors.batchNumber} minWidth={100} />
      <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
        error={entryErrors.expiryDate} />
      <EntryField label="الكمية الفعلية" kind="numeric" value={entry.countedQuantity}
        onChange={setField('countedQuantity')} inputRef={countedRef} error={entryErrors.countedQuantity}
        minWidth={110} />
      <EntryField label="الخصم %" kind="decimal" placeholder="للزيادة عن الرصيد" value={entry.discountPercent}
        onChange={setField('discountPercent')} inputRef={discountRef} error={entryErrors.discountPercent}
        minWidth={130} />
      <OkButton okRef={okRef} busy={busy} onClick={saveEntry} updating={editingExistingLine} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} pinnedBottomRowData={totalRow} posted={posted}
      onEdit={editLine}
      emptyText="أدخل التشغيلات واحدة واحدة: الصنف والتشغيلة والصلاحية والكمية الفعلية ثم OK" />

    <DocumentActions document={adjustment} posted={posted} busy={busy}
      nextStep={{ onClick: () => request('/post', 'POST'), disabled: lines.length === 0 }}
      onDeleteDraft={async () => (await deleteDraft(`حذف مسودة التسوية رقم ${adjustment.id}؟`)) && newAdjustment()}
      onNew={newAdjustment} />
  </Box>;
}
