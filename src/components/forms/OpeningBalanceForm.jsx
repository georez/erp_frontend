'use client';

import { Alert, Box, Stack } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import {
  amountColumn, checkBatchNumber, checkExpiry, deleteColumn, DescriptionField, DISCOUNT_ERROR, DocumentActions,
  documentStatus, DocumentTitle, EntryField, EntryRow, expiryColumn, ExpiryField, HeaderCombobox, LinesGrid,
  MAX_DESCRIPTION_LENGTH, OkButton, ProductField, REQUIRED, Total, useDocument, useOptions,
} from './documentForm';

const EMPTY_HEADER = { warehouseId: null, description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', quantity: '', discountPercent: '' };

/**
 * The opening balance document: the stock a warehouse starts with, against Capital. A draft is filled one batch at a
 * time: the entry row sends a product's batch (its number and expiry date), its quantity and the discount off the
 * public price its units cost, all required, to the backend (OK). Posting receives the stock and posts the journal
 * entry; a posted opening balance can't change (a mistake is corrected by a stock adjustment).
 */
export default function OpeningBalanceForm({ formId, formTitle, openingBalanceId }) {
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const {
    document: openingBalance, loadError, header, changeHeader, saveTextOnBlur, busy, errorMessage, setErrorMessage,
    posted, saveToDraft, request, openNew, deleteDraft,
  } = useDocument({
    api: '/api/opening-balances', documentId: openingBalanceId, formId, formTitle, page: '/dashboard/opening-balance',
    idParam: 'openingBalanceId', emptyHeader: EMPTY_HEADER,
    headerFrom: (loaded) => ({ warehouseId: loaded.warehouseId, description: loaded.description ?? '' }),
    headerBody: (next) => ({ warehouseId: next.warehouseId, description: next.description.trim() || null }),
  });

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = useMemo(() => openingBalance?.lines ?? [], [openingBalance]);
  const optionsError = warehouses.error ?? products.error;
  const setField = (field) => (value) => setEntry((previous) => ({ ...previous, [field]: value }));

  const saveEntry = async () => {
    const quantity = parseWholeUnits(entry.quantity);
    const discount = parsePercent(entry.discountPercent);
    const batch = checkBatchNumber(entry.batchNumber);
    const expiry = checkExpiry(entry.expiryDate);
    const errors = {
      warehouseId: header.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: batch.error,
      expiryDate: expiry.error,
      quantity: entry.quantity.trim() === '' ? REQUIRED
        : quantity != null && Big(quantity).signum() > 0 ? null : 'عدد صحيح أكبر من صفر',
      discountPercent: entry.discountPercent.trim() === '' ? REQUIRED : discount ? null : DISCOUNT_ERROR,
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
      discountPercent: normalizeDecimalText(entry.discountPercent),
    });
    if (saved) {
      // The product stays selected (its next batch often comes next); the cursor goes back to it
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const newOpeningBalance = () => {
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

  // Rebuilt every render: the delete buttons need the current document and busy state
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    { field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110 },
    expiryColumn(),
    amountColumn('quantity', 'الكمية', 85),
    amountColumn('publicPrice', 'سعر الجمهور'),
    amountColumn('discountPercent', 'الخصم %'),
    amountColumn('unitCost', 'تكلفة الوحدة', 100),
    amountColumn('value', 'القيمة', 100),
    ...deleteColumn(posted, busy, (line) => request(`/lines/${line.id}`, 'DELETE')),
  ];

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header: one line */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexShrink: 0 }}>
      <DocumentTitle title={openingBalance ? `رصيد افتتاحي رقم ${openingBalance.id}` : 'رصيد افتتاحي جديد'}
        status={documentStatus(openingBalance, { newLabel: 'جديد', postedLabel: 'مُرحَّل' })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={190} options={warehouses.options}
        value={header.warehouseId} disabled={posted || busy} onChange={(warehouseId) => changeHeader({ warehouseId })} />
      <DescriptionField value={header.description} disabled={posted}
        onChange={(description) => changeHeader({ description }, false)}
        onBlur={saveTextOnBlur('description', openingBalance?.description)} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.warehouseId && <Alert severity="warning">{entryErrors.warehouseId}</Alert>}

    {/* Entry row: one batch at a time; Enter moves to the next field */}
    {!posted && <EntryRow fieldRefs={[productRef, batchRef, expiryRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={entry.productId}
        onChange={setField('productId')} error={entryErrors.productId} />
      <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')} inputRef={batchRef}
        error={entryErrors.batchNumber} minWidth={100} />
      <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
        error={entryErrors.expiryDate} />
      <EntryField label="الكمية" kind="numeric" value={entry.quantity} onChange={setField('quantity')}
        inputRef={quantityRef} error={entryErrors.quantity} />
      <EntryField label="الخصم %" kind="decimal" value={entry.discountPercent} onChange={setField('discountPercent')}
        inputRef={discountRef} error={entryErrors.discountPercent} />
      <OkButton okRef={okRef} busy={busy} onClick={saveEntry} updating={editingExistingLine} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} posted={posted} onEdit={editLine}
      emptyText="أدخل التشغيلات واحدة واحدة: الصنف والتشغيلة والصلاحية والكمية والخصم ثم OK" />

    <DocumentActions document={openingBalance} posted={posted} busy={busy}
      nextStep={{ onClick: () => request('/post', 'POST'), disabled: lines.length === 0 }}
      onDeleteDraft={async () => (await deleteDraft(`حذف مسودة الرصيد الافتتاحي رقم ${openingBalance.id}؟`))
        && newOpeningBalance()}
      onNew={newOpeningBalance}>
      <Total label="القيمة" value={openingBalance?.totalValue ?? '0'} strong />
    </DocumentActions>
  </Box>;
}
