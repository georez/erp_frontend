'use client';

import { Alert, Box, Stack, TextField } from '@mui/material';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { fetchJson } from '@/utils/fetchJson';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import {
  amountColumn, BatchPicker, deleteColumn, DescriptionField, DISCOUNT_ERROR, DocumentActions, documentStatus,
  DocumentTitle, EntryField, EntryRow, expiryColumn, formatAmount, HeaderCombobox, LinesGrid, MAX_DESCRIPTION_LENGTH,
  NUMBER_CELL, OkButton, ProductField, REQUIRED, Total, useDocument, useOptions,
} from './documentForm';

const EMPTY_HEADER = { supplierId: null, warehouseId: null, purchaseInvoiceId: '', description: '' };
// batch: { batchNumber, expiryDate, available } from the batches to choose from
const EMPTY_ENTRY = { productId: null, batch: null, quantity: '', discountPercent: '' };
const NO_BATCHES = [];

/**
 * The purchase return document: stock sent back to a supplier. A draft is filled one line at a time: a product, its
 * batch (number and expiry date, chosen together by typing part of either), the quantity and a discount. Against a
 * purchase invoice (a posted one, entered when its field is left), the supplier and warehouse are the invoice's (filled
 * in, the supplier locked), the products and batches to choose from are the invoice's (with units left to return),
 * each unit is credited at what it cost on the invoice and the discount field is off; without one, the batches are
 * those the warehouse has. Posting takes the
 * goods out of their batch at the average cost, debits the supplier with the total (rounded to 2 decimals), and puts
 * the difference between what the supplier credits and what the goods cost on purchase price differences.
 */
export default function PurchaseReturnForm({ formId, formTitle, returnId }) {
  const suppliers = useOptions('suppliers');
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const {
    document: purchaseReturn, loadError, header, changeHeader, saveTextOnBlur, busy, errorMessage, setErrorMessage,
    posted, saveToDraft, request, openNew, deleteDraft,
  } = useDocument({
    api: '/api/purchase-returns', documentId: returnId, formId, formTitle, page: '/dashboard/purchase-return',
    idParam: 'returnId', emptyHeader: EMPTY_HEADER,
    headerFrom: (loaded) => ({
      supplierId: loaded.supplierId,
      warehouseId: loaded.warehouseId,
      purchaseInvoiceId: loaded.purchaseInvoiceId == null ? '' : String(loaded.purchaseInvoiceId),
      description: loaded.description ?? '',
    }),
    headerBody: (next) => ({
      supplierId: next.supplierId,
      warehouseId: next.warehouseId,
      purchaseInvoiceId: next.purchaseInvoiceId.trim() === '' ? null : parseWholeUnits(next.purchaseInvoiceId),
      description: next.description.trim() || null,
    }),
  });

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const productRef = useRef(null);
  const batchRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = useMemo(() => purchaseReturn?.lines ?? [], [purchaseReturn]);
  const optionsError = suppliers.error ?? warehouses.error ?? products.error;
  const invoiceIdText = header.purchaseInvoiceId.trim();
  const invoiceIdValid = invoiceIdText === '' || parseWholeUnits(invoiceIdText) != null;
  const setField = (field) => (value) => setEntry((previous) => ({ ...previous, [field]: value }));

  // The invoice the goods came on: the one in its field, once it's left (not each number as it's typed)
  const [invoiceFieldFocused, setInvoiceFieldFocused] = useState(false);
  const invoiceId = !invoiceFieldFocused && invoiceIdText && invoiceIdValid ? parseWholeUnits(invoiceIdText) : null;
  const { data: invoice } = useSWR(invoiceId != null ? `/api/purchase-invoices/${invoiceId}` : null, fetchJson);
  const postedInvoice = invoice?.status === 'POSTED' && String(invoice.id) === invoiceId ? invoice : null;
  // Against an invoice, only its products
  const productOptions = useMemo(() => (invoiceId == null ? products.options : products.options.filter(
    (option) => postedInvoice?.lines.some((line) => line.productId === option.value))),
  [invoiceId, postedInvoice, products.options]);

  /** The invoice field left: a posted invoice's supplier and warehouse are the return's (saved on a draft). */
  const enterInvoice = async () => {
    setInvoiceFieldFocused(false);
    if (!invoiceIdValid) {
      return;
    }
    const stored = purchaseReturn?.purchaseInvoiceId == null ? '' : String(purchaseReturn.purchaseInvoiceId);
    if (invoiceIdText === '') {
      saveTextOnBlur('purchaseInvoiceId', stored)();
      return;
    }
    let entered;
    try {
      entered = await fetchJson(`/api/purchase-invoices/${parseWholeUnits(invoiceIdText)}`);
    } catch (error) {
      setErrorMessage(error.message);
      return;
    }
    if (entered.status !== 'POSTED') {
      setErrorMessage(`فاتورة المشتريات رقم ${entered.id} غير مُرحَّلة: المرتجع يكون من فاتورة مُرحَّلة`);
      return;
    }
    setErrorMessage(null);
    if (entered.supplierId !== header.supplierId || entered.warehouseId !== header.warehouseId
      || stored !== invoiceIdText) {
      await changeHeader({ supplierId: entered.supplierId, warehouseId: entered.warehouseId });
    }
  };

  // The product's batches to choose from: those the warehouse has, against an invoice only the invoice's (no more than
  // it brought in less what was returned, nor than the warehouse still has)
  const batchQuery = entry.productId == null || header.warehouseId == null ? null
    : `/api/purchase-returns/batch-options?${new URLSearchParams({
      productId: entry.productId,
      warehouseId: header.warehouseId,
      ...(invoiceId != null && { invoiceId }),
    })}`;
  const { data: batchOptions = NO_BATCHES, isLoading: batchesLoading, mutate: reloadBatches } = useSWR(
    batchQuery, fetchJson);

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
      batch: entry.batch == null ? 'اختر التشغيلة' : null,
      quantity: entry.quantity.trim() === '' ? REQUIRED
        : quantity != null && Big(quantity).signum() > 0 ? null : 'عدد صحيح أكبر من صفر',
      discountPercent: discountEntered && !discount ? DISCOUNT_ERROR : null,
    };
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }
    // As text, so no number passes through a JavaScript number
    const saved = await saveToDraft('/lines', {
      productId: entry.productId,
      batchNumber: entry.batch.batchNumber,
      expiryDate: entry.batch.expiryDate,
      quantity,
      discountPercent: discountEntered ? normalizeDecimalText(entry.discountPercent) : null,
    });
    if (saved) {
      // The product stays selected; the cursor goes back to it, where Enter moves on and typing picks another
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const newReturn = () => {
    openNew();
    setEntry(EMPTY_ENTRY);
    setEntryErrors({});
  };

  /** A grid row into the entry row, to change it; OK then replaces the line. */
  const editLine = (line) => {
    // Rendered at once (the grid calls this from its own listener), so the quantity is in its field before it's
    // selected, and typing replaces it
    flushSync(() => {
      setEntry({
        productId: line.productId, batch: { batchNumber: line.batchNumber, expiryDate: line.expiryDate },
        quantity: line.quantity, discountPercent: line.discountPercent,
      });
      setEntryErrors({});
    });
    quantityRef.current?.focus();
    quantityRef.current?.select();
  };
  const editingExistingLine = entry.batch != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batch.batchNumber && line.expiryDate === entry.batch.expiryDate);

  // Rebuilt every render: the delete buttons need the current return and busy state
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    { field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110 },
    expiryColumn(),
    amountColumn('quantity', 'الكمية', 85),
    amountColumn('publicPrice', 'السعر', 85),
    amountColumn('discountPercent', 'الخصم %'),
    amountColumn('netAmount', 'الصافي', 95),
    amountColumn('vatPercent', 'الضريبة %', 100),
    amountColumn('vatAmount', 'الضريبة', 85),
    {
      ...amountColumn('stockValue', 'تكلفة البضاعة', 100),
      // Goods that aren't in stock: posting refuses the return
      valueFormatter: ({ value }) => (value == null ? 'غير متوفر' : formatAmount(value)),
      cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? '#c62828' : 'inherit' }),
    },
    ...deleteColumn(posted, busy, (line) => request(`/lines/${line.id}`, 'DELETE')),
  ];

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <DocumentTitle title={purchaseReturn ? `مرتجع مشتريات رقم ${purchaseReturn.id}` : 'مرتجع مشتريات جديد'}
        status={documentStatus(purchaseReturn, { newLabel: 'جديد', postedLabel: 'مُرحَّل' })} />
      <HeaderCombobox id={`${formId}-supplier`} label="المورد" basis={220} options={suppliers.options}
        value={header.supplierId} disabled={posted || busy || invoiceId != null} placeholder="اختر المورد…"
        onChange={(supplierId) => changeHeader({ supplierId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={posted || busy} onChange={(warehouseId) => changeHeader({ warehouseId })} />
      <TextField size="small" label="فاتورة المشتريات" placeholder="بدون" value={header.purchaseInvoiceId}
        disabled={posted} sx={{ flex: '0 1 140px' }} error={!invoiceIdValid}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => changeHeader({ purchaseInvoiceId: event.target.value }, false)}
        onFocus={() => setInvoiceFieldFocused(true)} onBlur={enterInvoice} />
      <DescriptionField value={header.description} disabled={posted}
        onChange={(description) => changeHeader({ description }, false)}
        onBlur={saveTextOnBlur('description', purchaseReturn?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.header && <Alert severity="warning">{entryErrors.header}</Alert>}

    {/* Entry row: one line at a time; Enter moves to the next field */}
    {!posted && <EntryRow fieldRefs={[productRef, batchRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={productOptions} value={entry.productId}
        onChange={(productId) => setEntry((previous) => ({ ...previous, productId, batch: null }))}
        error={entryErrors.productId} />
      <BatchPicker options={batchOptions} value={entry.batch} inputRef={batchRef} error={entryErrors.batch}
        loading={batchesLoading} availableLabel={invoiceId != null ? 'متاح للإرجاع' : 'في المخزن'}
        noOptionsText={entry.productId == null ? 'اختر الصنف أولاً' : header.warehouseId == null ? 'حدّد المخزن أولاً'
          : invoiceId != null ? 'لا توجد تشغيلات لهذا الصنف في الفاتورة' : 'لا توجد تشغيلات لهذا الصنف في المخزن'}
        onChange={(batch) => {
          setEntry((previous) => ({ ...previous, batch }));
          // Chosen: on to the quantity
          if (batch) {
            quantityRef.current?.focus();
          }
        }} />
      <EntryField label="الكمية" kind="numeric" value={entry.quantity} onChange={setField('quantity')}
        inputRef={quantityRef} error={entryErrors.quantity} />
      <EntryField label="الخصم %" kind="decimal" placeholder={invoiceIdText ? 'من الفاتورة' : '0'}
        disabled={!!invoiceIdText} value={invoiceIdText ? '' : entry.discountPercent}
        onChange={setField('discountPercent')} inputRef={discountRef} error={entryErrors.discountPercent} />
      <OkButton okRef={okRef} busy={busy} onClick={saveEntry} updating={editingExistingLine} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} posted={posted} onEdit={editLine}
      emptyText="أدخل الأصناف المرتجعة: الصنف والتشغيلة والصلاحية والكمية ثم OK" />

    <DocumentActions document={purchaseReturn} posted={posted} busy={busy}
      nextStep={{
        // Posted: what's left of each batch changed
        onClick: async () => {
          await request('/post', 'POST');
          await reloadBatches();
        },
        disabled: lines.length === 0,
      }}
      onDeleteDraft={async () => (await deleteDraft(`حذف مسودة مرتجع المشتريات رقم ${purchaseReturn.id}؟`))
        && newReturn()}
      onNew={newReturn}>
      <Total label="تكلفة البضاعة" value={purchaseReturn ? purchaseReturn.stockValue : '0'} />
      <Total label="فرق السعر" value={purchaseReturn ? purchaseReturn.priceDifference : '0'} />
      <Total label="الصافي" value={purchaseReturn?.netTotal ?? '0'} />
      <Total label="الضريبة" value={purchaseReturn?.vatTotal ?? '0'} />
      {purchaseReturn && Big(purchaseReturn.roundingDifference).signum() !== 0 &&
        <Total label="فرق التقريب" value={purchaseReturn.roundingDifference} />}
      <Total label="الإجمالي" value={purchaseReturn?.total ?? '0'} strong />
    </DocumentActions>
  </Box>;
}
