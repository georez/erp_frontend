'use client';

import { Alert, Box, Stack, TextField } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import {
  amountColumn, checkBatchNumber, checkExpiry, deleteColumn, DescriptionField, DISCOUNT_ERROR, DocumentActions,
  documentStatus, DocumentTitle, EntryField, EntryRow, expiryColumn, ExpiryField, formatAmount, HeaderCombobox,
  LinesGrid, MAX_DESCRIPTION_LENGTH, NUMBER_CELL, OkButton, ProductField, REQUIRED, Total, useDocument, useOptions,
} from './documentForm';

const EMPTY_HEADER = { supplierId: null, warehouseId: null, purchaseInvoiceId: '', description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', quantity: '', discountPercent: '' };

/**
 * The purchase return document: stock sent back to a supplier. A draft is filled one line at a time: a product, its
 * batch (number and expiry date), the quantity and a discount. Against a purchase invoice, the batch is one of the
 * invoice's, each unit is credited at what it cost on the invoice and the discount field is off. Posting takes the
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
  const expiryRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = useMemo(() => purchaseReturn?.lines ?? [], [purchaseReturn]);
  const optionsError = suppliers.error ?? warehouses.error ?? products.error;
  const invoiceIdText = header.purchaseInvoiceId.trim();
  const invoiceIdValid = invoiceIdText === '' || parseWholeUnits(invoiceIdText) != null;
  const setField = (field) => (value) => setEntry((previous) => ({ ...previous, [field]: value }));

  const saveEntry = async () => {
    const quantity = parseWholeUnits(entry.quantity);
    const batch = checkBatchNumber(entry.batchNumber);
    const expiry = checkExpiry(entry.expiryDate);
    // Against an invoice the units are credited at what they cost on it: no discount
    const discountEntered = !invoiceIdText && entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      header: header.supplierId == null ? 'حدّد المورد أولاً'
        : header.warehouseId == null ? 'حدّد المخزن أولاً'
          : !invoiceIdValid ? 'رقم فاتورة المشتريات غير صحيح' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: batch.error,
      expiryDate: expiry.error,
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
      batchNumber: batch.number,
      expiryDate: expiry.date,
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
        productId: line.productId, batchNumber: line.batchNumber, expiryDate: formatExpiry(line.expiryDate),
        quantity: line.quantity, discountPercent: line.discountPercent,
      });
      setEntryErrors({});
    });
    quantityRef.current?.focus();
    quantityRef.current?.select();
  };
  const editingExistingLine = entry.productId != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batchNumber.trim() && formatExpiry(line.expiryDate) === entry.expiryDate);

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
        value={header.supplierId} disabled={posted || busy} placeholder="اختر المورد…"
        onChange={(supplierId) => changeHeader({ supplierId })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={170} options={warehouses.options}
        value={header.warehouseId} disabled={posted || busy} onChange={(warehouseId) => changeHeader({ warehouseId })} />
      <TextField size="small" label="فاتورة المشتريات" placeholder="بدون" value={header.purchaseInvoiceId}
        disabled={posted} sx={{ flex: '0 1 140px' }} error={!invoiceIdValid}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => changeHeader({ purchaseInvoiceId: event.target.value }, false)}
        onBlur={() => invoiceIdValid && saveTextOnBlur('purchaseInvoiceId', purchaseReturn?.purchaseInvoiceId == null
          ? '' : String(purchaseReturn.purchaseInvoiceId))()} />
      <DescriptionField value={header.description} disabled={posted}
        onChange={(description) => changeHeader({ description }, false)}
        onBlur={saveTextOnBlur('description', purchaseReturn?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.header && <Alert severity="warning">{entryErrors.header}</Alert>}

    {/* Entry row: one line at a time; Enter moves to the next field */}
    {!posted && <EntryRow fieldRefs={[productRef, batchRef, expiryRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={entry.productId}
        onChange={setField('productId')} error={entryErrors.productId} />
      <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')} inputRef={batchRef}
        error={entryErrors.batchNumber} minWidth={100} />
      <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
        error={entryErrors.expiryDate} />
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
      nextStep={{ onClick: () => request('/post', 'POST'), disabled: lines.length === 0 }}
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
