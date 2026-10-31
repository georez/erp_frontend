'use client';

import { Alert, Box, Stack, TextField } from '@mui/material';
import { Big } from 'bigdecimal.js';
import useSWR, { mutate as fillCache } from 'swr';
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
 * in and locked), the products and batches to choose from are the invoice's (with units left to return),
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
    document: purchaseReturn, loadError, header, changeHeader, changeHeaderNow, saveTextOnBlur, settled, currentHeader,
    enqueue, act, busy, errorMessage, setErrorMessage, posted, saveToDraft, request, openNew, deleteDraft,
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
      // Always a posted invoice's number, or none (enterInvoice)
      purchaseInvoiceId: next.purchaseInvoiceId === '' ? null : next.purchaseInvoiceId,
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
  const setField = (field) => (value) => setEntry((previous) => ({ ...previous, [field]: value }));

  // The invoice the goods came on: the header's, set once its field is left with the number of a posted invoice (not
  // as each number is typed). Until then the field has the text typed.
  const invoiceId = header.purchaseInvoiceId === '' ? null : header.purchaseInvoiceId;
  const [invoiceText, setInvoiceText] = useState(header.purchaseInvoiceId);
  const [invoiceTextOf, setInvoiceTextOf] = useState(header.purchaseInvoiceId);
  if (header.purchaseInvoiceId !== invoiceTextOf) {
    setInvoiceTextOf(header.purchaseInvoiceId);
    setInvoiceText(header.purchaseInvoiceId);
  }
  const invoiceUrl = (id) => `/api/purchase-invoices/${id}`;
  const { data: invoice } = useSWR(invoiceId != null ? invoiceUrl(invoiceId) : null, fetchJson);
  const postedInvoice = invoice?.status === 'POSTED' && String(invoice.id) === invoiceId ? invoice : null;
  // Against an invoice, only its products
  const productOptions = useMemo(() => (invoiceId == null ? products.options : products.options.filter(
    (option) => postedInvoice?.lines.some((line) => line.productId === option.value))),
  [invoiceId, postedInvoice, products.options]);

  /**
   * The invoice field left: a posted invoice's number makes it the return's, with its supplier and warehouse (saved on
   * a draft); an empty field, none. In the queue (enqueue), so OK or ترحيل clicked right after waits for it. Any other
   * text is refused, and the field shows the return's invoice again: the draft keeps it.
   */
  const enterInvoice = () => {
    const text = invoiceText.trim();
    const refuse = (message) => {
      setErrorMessage(message);
      setInvoiceText(currentHeader().purchaseInvoiceId);
    };
    if (text === currentHeader().purchaseInvoiceId) {
      setInvoiceText(text);
      return;
    }
    const id = text === '' ? null : parseWholeUnits(text);
    if (text !== '' && id == null) {
      refuse(`رقم فاتورة المشتريات غير صحيح: ${text}`);
      return;
    }
    enqueue(async () => {
      let entered = null;
      if (id != null) {
        try {
          entered = await fetchJson(invoiceUrl(id));
        } catch (error) {
          refuse(error.message);
          return;
        }
        if (entered.status !== 'POSTED') {
          refuse(`فاتورة المشتريات رقم ${entered.id} غير مُرحَّلة: المرتجع يكون من فاتورة مُرحَّلة`);
          return;
        }
        fillCache(invoiceUrl(id), entered, { revalidate: false });
      }
      setErrorMessage(null);
      // A product not on the invoice, or a batch of another warehouse, is the entry row's no more
      setEntry((previous) => ({
        ...previous, batch: null,
        productId: entered && !entered.lines.some((line) => line.productId === previous.productId) ? null
          : previous.productId,
      }));
      await changeHeaderNow(entered
        ? { purchaseInvoiceId: id, supplierId: entered.supplierId, warehouseId: entered.warehouseId }
        : { purchaseInvoiceId: '' });
    });
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

  // Once an invoice just entered is (OK right after leaving its field): checked against the header as it then is
  const saveEntry = () => act(async () => {
    await settled();
    const current = currentHeader();
    const quantity = parseWholeUnits(entry.quantity);
    // Against an invoice the units are credited at what they cost on it: no discount
    const discountEntered = current.purchaseInvoiceId === '' && entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      header: current.supplierId == null ? 'حدّد المورد أولاً'
        : current.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batch: entry.batch == null ? 'اختر التشغيلة' : null,
      quantity: entry.quantity.trim() === '' ? REQUIRED
        : quantity != null && Big(quantity).signum() > 0 ? null : 'عدد صحيح أكبر من صفر',
      discountPercent: discountEntered && !discount ? DISCOUNT_ERROR : null,
    };
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || current.description.length > MAX_DESCRIPTION_LENGTH) {
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
  });

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
      // At the invoice's value while only purchases have moved the product in the warehouse since (no price
      // difference), else at the average
      tooltipValueGetter: ({ data }) => {
        if (!data || data.stockValue == null) {
          return undefined;
        }
        return data.atInvoiceValue ? 'بسعر الفاتورة: لم يتحرك الصنف في المخزن منذ الفاتورة إلا بمشتريات'
          : 'بمتوسط التكلفة';
      },
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
        value={header.warehouseId} disabled={posted || busy || invoiceId != null}
        onChange={(warehouseId) => {
          // Its batches are another warehouse's
          setEntry((previous) => ({ ...previous, batch: null }));
          changeHeader({ warehouseId });
        }} />
      <TextField size="small" label="فاتورة المشتريات" placeholder="بدون" value={invoiceText}
        disabled={posted} sx={{ flex: '0 1 140px' }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', dir: 'ltr' } }}
        onChange={(event) => setInvoiceText(event.target.value)} onBlur={enterInvoice} />
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
      <EntryField label="الخصم %" kind="decimal" placeholder={invoiceId != null ? 'من الفاتورة' : '0'}
        disabled={invoiceId != null} value={invoiceId != null ? '' : entry.discountPercent}
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
