'use client';

import { useRef } from 'react';
import { formatExpiry } from '@/utils/expiryDates';
import { useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import { DescriptionField, DocumentTitle, documentStatus, HeaderCombobox, HeaderRow } from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { EntryField, EntryRow, ExpiryField, OkButton, ProductField } from './document/EntryFields';
import {
  checkBatchNumber, checkExpiry, checkQuantity, checkRequiredDiscount, hasErrors, headerProblem, missingProduct,
} from './document/entryChecks';
import { amountColumn, deleteColumn, expiryColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { openPrintout } from '@/components/print/printPages';

/*
 * The opening balance document: the stock a warehouse starts with, against Capital. Its header (warehouse,
 * description) is typed in and saved as it's left. Each entry row line is a batch: a product's batch (its number and
 * expiry date), its quantity and the discount off the public price its units cost, all required. Posting receives the
 * stock and posts the journal entry; a posted opening balance can't change (a mistake is corrected by a stock
 * adjustment).
 */

const EMPTY_HEADER = { warehouseId: null, description: '' };
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', quantity: '', discountPercent: '' };

const headerFrom = (loaded) => ({ warehouseId: loaded.warehouseId, description: loaded.description ?? '' });
const headerBody = (header) => ({ warehouseId: header.warehouseId, description: header.description.trim() || null });

/** The entry row's errors by field, and the line to send when it has none. */
function checkEntry(entry) {
  const batch = checkBatchNumber(entry.batchNumber);
  const expiry = checkExpiry(entry.expiryDate);
  const quantity = checkQuantity(entry.quantity);
  const discount = checkRequiredDiscount(entry.discountPercent);
  const errors = {
    productId: missingProduct(entry.productId),
    batchNumber: batch.error,
    expiryDate: expiry.error,
    quantity: quantity.error,
    discountPercent: discount.error,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  const line = {
    productId: entry.productId,
    batchNumber: batch.number,
    expiryDate: expiry.date,
    quantity: quantity.quantity,
    discountPercent: discount.discount,
  };
  return { errors, line };
}

/** A line of the opening balance as the entry row shows it, to change it. */
const entryFromLine = (line) => ({
  productId: line.productId,
  batchNumber: line.batchNumber,
  expiryDate: formatExpiry(line.expiryDate),
  quantity: line.quantity,
  discountPercent: line.discountPercent,
});

/** Whether the entry row is one of the lines: OK then replaces it. */
const isOneOfTheLines = (entry, lines) => entry.productId != null && lines.some((line) =>
  line.productId === entry.productId
  && line.batchNumber === entry.batchNumber.trim()
  && formatExpiry(line.expiryDate) === entry.expiryDate);

const gridColumns = (isPosted, onDelete) => [
  textColumn('productName', 'الصنف', { flex: 2, minWidth: 140 }),
  textColumn('batchNumber', 'التشغيلة'),
  expiryColumn(),
  amountColumn('quantity', 'الكمية', 85),
  amountColumn('publicPrice', 'سعر الجمهور'),
  amountColumn('discountPercent', 'الخصم %'),
  amountColumn('unitCost', 'تكلفة الوحدة', 100),
  amountColumn('value', 'القيمة', 100),
  ...deleteColumn(isPosted, onDelete),
];

export default function OpeningBalanceForm({ formId, formTitle, openingBalanceId }) {
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const doc = useDocument({
    api: '/api/opening-balances', documentId: openingBalanceId, formId, formTitle, page: '/dashboard/opening-balance',
    idParam: 'openingBalanceId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: openingBalance, header, editable, isDraft, isPosted } = doc;
  const entryRow = useEntryRow(EMPTY_ENTRY);
  const { entry, setField } = entryRow;

  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const quantityRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const lines = openingBalance?.lines ?? [];

  /** Sends the line; the row is cleared at once, so the next batch can be typed while it's sent. */
  const saveEntry = () => {
    const headerWarning = doc.isNew ? headerProblem(header) : null;
    const { errors, line } = checkEntry(entry);
    entryRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    doc.addLine(line, products.labelOf(line.productId));
    // The product stays chosen: its next batch often comes next
    entryRow.clearKeepingProduct();
    productRef.current?.focus();
  };

  const newOpeningBalance = () => {
    doc.openNew();
    entryRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة الرصيد الافتتاحي رقم ${openingBalance.id}؟`)) {
      newOpeningBalance();
    }
  };

  const columnDefs = gridColumns(isPosted, (line) => doc.sendToDraft(`/lines/${line.id}`, 'DELETE'));

  return <DocumentWindow>
    <HeaderRow>
      <DocumentTitle title={openingBalance ? `رصيد افتتاحي رقم ${openingBalance.id}` : 'رصيد افتتاحي جديد'}
        status={documentStatus(openingBalance, { newLabel: 'جديد', postedLabel: 'مُرحَّل' })} />
      <HeaderCombobox id={`${formId}-warehouse`} label="المخزن" basis={190} options={warehouses.options}
        value={header.warehouseId} disabled={!editable}
        onChange={(warehouseId) => doc.changeHeader({ warehouseId })} />
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    <DocumentAlerts loadError={doc.loadError} optionsError={warehouses.error ?? products.error}
      headerWarning={entryRow.errors.header} />

    {editable && <EntryRow fieldRefs={[productRef, batchRef, expiryRef, quantityRef, discountRef, okRef]}>
      <ProductField productRef={productRef} options={products.options} value={entry.productId}
        onChange={setField('productId')} error={entryRow.errors.productId} />
      <EntryField label="التشغيلة" kind="batch" value={entry.batchNumber} onChange={setField('batchNumber')}
        inputRef={batchRef} error={entryRow.errors.batchNumber} minWidth={100} />
      <ExpiryField value={entry.expiryDate} onChange={setField('expiryDate')} inputRef={expiryRef}
        error={entryRow.errors.expiryDate} />
      <EntryField label="الكمية" kind="numeric" value={entry.quantity} onChange={setField('quantity')}
        inputRef={quantityRef} error={entryRow.errors.quantity} />
      <EntryField label="الخصم %" kind="decimal" value={entry.discountPercent} onChange={setField('discountPercent')}
        inputRef={discountRef} error={entryRow.errors.discountPercent} />
      <OkButton okRef={okRef} onClick={saveEntry} updating={isOneOfTheLines(entry, lines)} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} isPosted={isPosted}
      onEdit={(line) => entryRow.fill(entryFromLine(line), quantityRef)}
      emptyText={doc.isNew ? NEW_DOCUMENT_HINT
        : 'أدخل التشغيلات واحدة واحدة: الصنف والتشغيلة والصلاحية والكمية والخصم ثم OK'} />

    <DocumentActions isNew={doc.isNew} isDraft={isDraft} pending={doc.pending}
      nextStep={{ onClick: () => doc.sendToDraft('/post', 'POST'), disabled: lines.length === 0 }}
      onDeleteDraft={deleteThisDraft} onNew={newOpeningBalance}
      onPrint={openingBalance ? () => openPrintout('opening-balance', openingBalance.id) : undefined}>
      <Total label="القيمة" value={openingBalance?.totalValue ?? '0'} strong />
    </DocumentActions>
  </DocumentWindow>;
}
