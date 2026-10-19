'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SendIcon from '@mui/icons-material/Send';
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useContext, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Combobox } from '@/components/ui/ComboBox2';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson } from '@/utils/fetchJson';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { formatDecimal, normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import {
  COMBOBOX_MESSAGES, formatAmount, Labelled, MAX_BATCH_NUMBER_LENGTH, MAX_DESCRIPTION_LENGTH, moveOnEnter,
  NO_BATCH_LABEL, NUMBER_CELL, useDocumentRequests, useOptions,
} from './documentForm';

const modules = [AllCommunityModule];
const API = '/api/stock-adjustments';
const EMPTY_ENTRY = { productId: null, batchNumber: '', expiryDate: '', countedQuantity: '', discountPercent: '' };

/** A line whose cost is the average cost: no discount entered, or a loss (which always goes at the average). */
const isAverageDiscount = (line) => line.discountPercent == null || Big(line.difference).signum() < 0;

/**
 * The stock adjustment document: the stock counted in one warehouse. A draft is filled one batch at a time: the
 * entry row sends a product's batch (its number, and the expiry date of a new batch) and its counted quantity (whole
 * units: the products are pharmaceuticals) to the backend (OK), and the grid shows the lines as the backend has them,
 * with what posting would do with the batch's stock now: counted above the balance is received at the product's
 * public price less the discount entered (else the average cost), below it is issued at the average cost. Posting
 * does it and posts the journal entry; a posted adjustment can't change.
 *
 * The draft is created with its first line; its id then goes into the window's URL, so the window opens it again.
 */
export default function StockAdjustmentForm({ formId, formTitle, adjustmentId }) {
  const { csrfFetch } = useContext(AuthContext);
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const warehouses = useOptions('warehouses');
  const products = useOptions('products');
  const accounts = useOptions('leaf_accounts');

  const { data: adjustment, error: loadError, mutate } = useSWR(
    adjustmentId ? `${API}/${adjustmentId}` : null, fetchJson, { revalidateOnFocus: false });

  // The header: for a new adjustment, what's entered; for a draft, what it has (reset whenever it's loaded again).
  // Set during render, not in an effect, so the stale header is never shown:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [header, setHeader] = useState({ warehouseId: null, offsetAccountId: null, description: '' });
  const [headerLoadedFrom, setHeaderLoadedFrom] = useState(null);
  if (adjustment && adjustment !== headerLoadedFrom) {
    setHeaderLoadedFrom(adjustment);
    setHeader({
      warehouseId: adjustment.warehouseId,
      offsetAccountId: adjustment.offsetAccountId,
      description: adjustment.description ?? '',
    });
  }

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [entryErrors, setEntryErrors] = useState({});
  const { send, busy, errorMessage, setErrorMessage } = useDocumentRequests(csrfFetch);
  const productRef = useRef(null);
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const countedRef = useRef(null);
  const discountRef = useRef(null);
  const okRef = useRef(null);

  const posted = adjustment?.status === 'POSTED';
  const lines = useMemo(() => adjustment?.lines ?? [], [adjustment]);
  const optionsError = warehouses.error ?? products.error ?? accounts.error;

  /** Shows the adjustment a request answered with, or loads it again if the request failed. */
  const show = (saved) => mutate(saved ?? undefined, { revalidate: !saved });

  const headerBody = (changes = {}) => {
    const next = { ...header, ...changes };
    return {
      warehouseId: next.warehouseId,
      offsetAccountId: next.offsetAccountId,
      description: next.description.trim() || null,
    };
  };

  /** A header change: kept until the draft exists, saved at once on a draft (the description when it's left). */
  const changeHeader = async (changes, save = true) => {
    setHeader((previous) => ({ ...previous, ...changes }));
    if (save && adjustment && !posted) {
      await show(await send(`${API}/${adjustment.id}`, 'PUT', headerBody(changes)));
    }
  };

  const saveEntry = async () => {
    const counted = parseWholeUnits(entry.countedQuantity);
    const discountEntered = entry.discountPercent.trim() !== '';
    const discount = discountEntered ? parsePercent(entry.discountPercent) : null;
    const errors = {
      warehouseId: header.warehouseId == null ? 'حدّد المخزن أولاً' : null,
      productId: entry.productId == null ? 'حدّد الصنف' : null,
      batchNumber: entry.batchNumber.trim().length > MAX_BATCH_NUMBER_LENGTH
        ? `الحد الأقصى ${MAX_BATCH_NUMBER_LENGTH} حرف` : null,
      countedQuantity: counted != null ? null : 'عدد صحيح من الوحدات',
      discountPercent: discountEntered && !discount ? 'من 0 إلى 100، حتى 3 أرقام عشرية' : null,
    };
    setEntryErrors(errors);
    if (Object.values(errors).some(Boolean) || header.description.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }

    let id = adjustment?.id;
    if (!id) {
      const created = await send(API, 'POST', headerBody());
      if (!created) {
        return;
      }
      id = created.id;
    }
    // As text, so no number passes through a JavaScript number
    const saved = await send(`${API}/${id}/lines`, 'PUT', {
      productId: entry.productId,
      // Empty: the stock from before batches; a new batch's expiry date is required by the backend
      batchNumber: entry.batchNumber.trim(),
      expiryDate: entry.expiryDate || null,
      countedQuantity: counted,
      discountPercent: discountEntered ? normalizeDecimalText(entry.discountPercent) : null,
    });
    if (adjustment) {
      await show(saved);
    } else {
      // From now on the window opens this draft (and loads it, with the line if it was saved)
      updateOpenFormUrl(`/dashboard/stock-adjustment?formTitle=${encodeURIComponent(formTitle)
        }&adjustmentId=${encodeURIComponent(id)}`);
    }
    if (saved) {
      // The product stays selected (its next batch is often counted next); the cursor goes back to it, where Enter
      // moves on to the batch, and typing picks another product
      setEntry((previous) => ({ ...EMPTY_ENTRY, productId: previous.productId }));
      setEntryErrors({});
      productRef.current?.focus();
    }
  };

  const deleteLine = async (lineId) => {
    await show(await send(`${API}/${adjustment.id}/lines/${lineId}`, 'DELETE'));
  };

  const post = async () => {
    await show(await send(`${API}/${adjustment.id}/post`, 'POST'));
  };

  const openNew = () => {
    updateOpenFormUrl(`/dashboard/stock-adjustment?formTitle=${encodeURIComponent(formTitle)}`);
    // Same warehouse and account: the next adjustment is usually another part of the same count
    setHeader((previous) => ({ ...previous, description: '' }));
    // headerLoadedFrom stays the document just left: until the URL has changed, it's still the one loaded, and
    // forgetting it would load its header back over the cleared one
    setEntry(EMPTY_ENTRY);
    setEntryErrors({});
    setErrorMessage(null);
  };

  const deleteDraft = async () => {
    if (!window.confirm(`حذف مسودة التسوية رقم ${adjustment.id}؟`)) {
      return;
    }
    if (await send(`${API}/${adjustment.id}`, 'DELETE')) {
      openNew();
    }
  };

  // Enter moves product → batch → expiry → counted quantity → discount → OK, and Enter on OK sends the line
  const onEntryKeyDown = (event) => moveOnEnter(event,
    [productRef, batchRef, expiryRef, countedRef, discountRef, okRef]);

  /** A grid row into the entry row, to change its count or discount; OK then replaces the line. */
  const editLine = (line) => {
    // Rendered at once (the grid calls this from its own listener, where React would render later), so the count is
    // in its field before it's selected, and typing replaces it instead of adding to it
    flushSync(() => {
      setEntry({
        productId: line.productId, batchNumber: line.batchNumber, expiryDate: line.expiryDate ?? '',
        countedQuantity: line.countedQuantity, discountPercent: line.discountPercent ?? '',
      });
      setEntryErrors({});
    });
    countedRef.current?.focus();
    countedRef.current?.select();
  };
  const editingExistingLine = entry.productId != null && lines.some((line) => line.productId === entry.productId
    && line.batchNumber === entry.batchNumber.trim());

  // Rebuilt every render: the delete buttons need the current adjustment and busy state, and the grid only
  // redraws the cells whose values changed
  const columnDefs = [
    { field: 'productName', headerName: 'الصنف', flex: 2, minWidth: 140 },
    {
      field: 'batchNumber', headerName: 'التشغيلة', flex: 1, minWidth: 110,
      valueFormatter: ({ value, node }) => (node.rowPinned ? '' : value || NO_BATCH_LABEL),
    },
    {
      field: 'expiryDate', headerName: 'الصلاحية', flex: 1, minWidth: 110,
      cellStyle: NUMBER_CELL,
    },
    {
      field: 'publicPrice', headerName: 'سعر الجمهور', flex: 1, minWidth: 90,
      valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
    },
    {
      field: 'balanceQuantity', headerName: posted ? 'الرصيد عند الترحيل' : 'الرصيد الحالي',
      valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL, flex: 1, minWidth: 100,
    },
    {
      field: 'countedQuantity', headerName: 'الكمية الفعلية',
      valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL, flex: 1, minWidth: 100,
    },
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
      // The discount the line's cost is: the one entered when it applies (stock counted above the balance), else the
      // average cost's, shown greyed (left empty, a discount means the average cost; a loss always goes at it)
      field: 'costDiscountPercent', headerName: 'الخصم %', flex: 0.8, minWidth: 80,
      valueFormatter: ({ value }) => formatAmount(value),
      cellStyle: ({ data, node }) => ({
        ...NUMBER_CELL,
        ...(!node.rowPinned && isAverageDiscount(data) && { color: '#757575', fontStyle: 'italic' }),
      }),
      tooltipValueGetter: ({ data, node }) => (!node.rowPinned && isAverageDiscount(data) && data.costDiscountPercent != null
        ? 'خصم متوسط التكلفة' : undefined),
    },
    {
      field: 'unitCost', headerName: 'تكلفة الوحدة', flex: 1, minWidth: 100,
      valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
    },
    {
      field: 'value', headerName: 'القيمة', flex: 1, minWidth: 100,
      // Stock counted above the balance of a product that has none, without a discount: posting needs one
      valueFormatter: ({ value }) => (value == null ? 'أدخل الخصم' : formatAmount(value)),
      cellStyle: ({ value }) => ({ ...NUMBER_CELL, color: value == null ? '#c62828' : 'inherit' }),
    },
    ...(posted ? [] : [{
      headerName: '', colId: 'delete', width: 56, resizable: false,
      cellRenderer: ({ data, node }) => (node.rowPinned ? null :
        <IconButton size="small" aria-label={`حذف ${data.productName}`} disabled={busy}
          onClick={() => deleteLine(data.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>),
    }]),
  ];

  // The total value, exact (bigdecimal.js); none while a line has no value yet
  const totalRow = useMemo(() => (lines.length === 0 ? [] : [{
    id: 'total',
    productName: 'الإجمالي',
    value: lines.every((line) => line.value != null)
      ? lines.reduce((sum, line) => sum.add(Big(line.value)), Big(0)).toPlainString()
      : null,
  }]), [lines]);

  const comboboxProps = { fullWidth: true, messages: COMBOBOX_MESSAGES };
  const status = !adjustment ? { label: 'جديدة', color: 'default' }
    : posted ? { label: `مُرحَّلة · قيد ${adjustment.journalEntryId}`, color: 'success' }
      : { label: 'مسودة', color: 'warning' };

  return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1, boxSizing: 'border-box' }}>
    {/* Header: one line */}
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexShrink: 0 }}>
      <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {adjustment ? `تسوية رقم ${adjustment.id}` : 'تسوية جديدة'}
      </Typography>
      <Chip size="small" label={status.label} color={status.color} sx={{ flexShrink: 0 }} />
      <Labelled id={`${formId}-warehouse`} label="المخزن" basis={190}>
        <Combobox {...comboboxProps} aria-labelledby={`${formId}-warehouse`} options={warehouses.options}
          value={header.warehouseId} disabled={posted || busy} placeholder="اختر…"
          onChange={(warehouseId) => warehouseId != null && changeHeader({ warehouseId })} />
      </Labelled>
      <Labelled id={`${formId}-offset`} label="حساب الفروقات" basis={250}>
        <Combobox {...comboboxProps} clearable aria-labelledby={`${formId}-offset`} options={accounts.options}
          value={header.offsetAccountId} disabled={posted || busy} placeholder="فروقات المخزون"
          onChange={(offsetAccountId) => changeHeader({ offsetAccountId })} />
      </Labelled>
      <TextField size="small" placeholder="البيان" value={header.description} disabled={posted}
        sx={{ flex: '1 1 160px', minWidth: 0 }} error={header.description.length > MAX_DESCRIPTION_LENGTH}
        slotProps={{ htmlInput: { 'aria-label': 'البيان' } }}
        onChange={(event) => changeHeader({ description: event.target.value }, false)}
        onBlur={() => adjustment && (adjustment.description ?? '') !== header.description.trim()
          && changeHeader({})} />
    </Stack>

    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {optionsError && <Alert severity="error">{optionsError.message}</Alert>}
    {errorMessage && <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>}
    {entryErrors.warehouseId && <Alert severity="warning">{entryErrors.warehouseId}</Alert>}

    {/* Entry row: one product at a time; Enter in a field is OK */}
    {!posted && <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexShrink: 0 }}
      onKeyDown={onEntryKeyDown}>
      <Box sx={{ flex: 2, minWidth: 180 }}>
        <Combobox {...comboboxProps} ref={productRef} aria-label="الصنف"
          options={products.options}
          value={entry.productId} placeholder="اختر الصنف…"
          onChange={(productId) => setEntry((previous) => ({ ...previous, productId }))} />
        {entryErrors.productId && <Typography variant="caption" color="error">{entryErrors.productId}</Typography>}
      </Box>
      <TextField size="small" label="التشغيلة" placeholder={NO_BATCH_LABEL} value={entry.batchNumber}
        sx={{ flex: 1, minWidth: 100 }}
        onChange={(event) => setEntry((previous) => ({ ...previous, batchNumber: event.target.value }))}
        inputRef={batchRef}
        error={!!entryErrors.batchNumber} helperText={entryErrors.batchNumber}
        slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <TextField size="small" label="الصلاحية" type="date" value={entry.expiryDate} sx={{ flex: 1, minWidth: 140 }}
        onChange={(event) => setEntry((previous) => ({ ...previous, expiryDate: event.target.value }))}
        inputRef={expiryRef}
        helperText="للتشغيلة الجديدة"
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />
      <TextField size="small" label="الكمية الفعلية" value={entry.countedQuantity} sx={{ flex: 1, minWidth: 110 }}
        onChange={(event) => setEntry((previous) => ({ ...previous, countedQuantity: event.target.value }))}
        inputRef={countedRef}
        error={!!entryErrors.countedQuantity} helperText={entryErrors.countedQuantity}
        slotProps={{ htmlInput: { inputMode: 'numeric', dir: 'ltr' } }} />
      <TextField size="small" label="الخصم %" placeholder="المتوسط" value={entry.discountPercent}
        sx={{ flex: 1, minWidth: 110 }}
        onChange={(event) => setEntry((previous) => ({ ...previous, discountPercent: event.target.value }))}
        inputRef={discountRef}
        error={!!entryErrors.discountPercent} helperText={entryErrors.discountPercent}
        slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr' } }} />
      <Button ref={okRef} variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={saveEntry}
        sx={{ flexShrink: 0, height: 40, minWidth: 96 }}>
        {editingExistingLine ? 'تحديث' : 'OK'}
      </Button>
    </Stack>}

    {/* The lines as the backend has them */}
    <Box sx={{ flex: 1, minHeight: 160 }}>
      <AgGridProvider modules={modules}>
        <AgGridReact
          rowData={lines}
          columnDefs={columnDefs}
          pinnedBottomRowData={totalRow}
          getRowId={({ data }) => String(data.id)}
          // A click on a line edits it, except on its delete button
          onRowClicked={({ data, node, event }) => !posted && !node.rowPinned
            && !event?.target?.closest?.('button') && editLine(data)}
          rowStyle={posted ? undefined : { cursor: 'pointer' }}
          defaultColDef={{ sortable: false, resizable: true, wrapHeaderText: true, autoHeaderHeight: true }}
          enableRtl
          enableCellTextSelection
          ensureDomOrder
          overlayNoRowsTemplate="<span>أدخل التشغيلات واحدة واحدة: الصنف والتشغيلة والكمية الفعلية ثم OK</span>"
        />
      </AgGridProvider>
    </Box>

    {/* Actions */}
    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
      {adjustment && !posted && <>
        <Button variant="contained" color="success" startIcon={<SendIcon />} disabled={busy || lines.length === 0}
          onClick={post}>
          ترحيل
        </Button>
        <Button color="error" startIcon={<DeleteForeverIcon />} disabled={busy} onClick={deleteDraft}>
          حذف المسودة
        </Button>
      </>}
      {adjustment && <Button startIcon={<AddIcon />} disabled={busy} onClick={openNew}>جديد</Button>}
    </Stack>
  </Box>;
}
