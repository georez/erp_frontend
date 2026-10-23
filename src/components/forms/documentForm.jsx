'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SendIcon from '@mui/icons-material/Send';
import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { Combobox } from '@/components/ui/ComboBox2';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';
import { formatDecimal } from '@/utils/decimals';
import { formatExpiry, parseExpiry } from '@/utils/expiryDates';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';

/*
 * What the stock document forms (stock adjustment, opening balance, purchase invoice and return) share: a draft
 * filled one line at a time from an entry row, with a grid of the lines as the backend has them.
 */

export const MAX_DESCRIPTION_LENGTH = 500;
// batches.batch_number is varchar(50)
export const MAX_BATCH_NUMBER_LENGTH = 50;
export const REQUIRED = 'مطلوب';
export const DISCOUNT_ERROR = 'من 0 إلى 100، حتى 3 أرقام عشرية';

export const COMBOBOX_MESSAGES = {
  clear: 'مسح الاختيار',
  typeToJump: (count) => `${count.toLocaleString('ar-EG')} عنصر · اكتب للانتقال`,
  jumpedBy: (text) => <>انتقال إلى «<bdi>{text}</bdi>»</>,
  sameCode: (code, count) => <>{count} أصناف بالباركود <bdi>{code}</bdi>: اختر واحداً</>,
};
export const COMBOBOX_PROPS = { fullWidth: true, messages: COMBOBOX_MESSAGES };

// Numbers left to right inside the right-to-left grid, so a sign stays in front ("-3", not "3-"); still aligned
// with the other cells, at the column's start
export const NUMBER_CELL = { direction: 'ltr', textAlign: 'right' };

/** Decimal text from the backend ("12.5"), formatted for the grid; empty for none. */
export const formatAmount = (value) => (value == null ? '' : formatDecimal(Big(value)));

/** All of a link entity's records as ComboBox2 options ({ value, label }). */
export function useOptions(linkEntity) {
  const { data = [], error } = useSWR(`/api/schemacrud/options/entity/${linkEntity}`, fetchJson);
  return { options: data, error };
}

/**
 * Sending a document's requests: send(url, method, body) returns what the backend answers with ({} for an empty
 * answer), or null after setting errorMessage to why it failed. One request at a time: busy is true meanwhile, for the
 * buttons to be disabled.
 */
function useDocumentRequests(csrfFetch) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (url, method, body) => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const res = await sendOrShowError(() => csrfFetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), setErrorMessage);
      if (!res) {
        return null;
      }
      if (!res.ok) {
        setErrorMessage(await readErrorMessage(res));
        return null;
      }
      return res.status === 204 ? {} : await res.json();
    } finally {
      setBusy(false);
    }
  };

  return { send, busy, errorMessage, setErrorMessage };
}

/**
 * A document in a form window: the document the window shows (documentId: none for a new one), its header as edited,
 * and the requests that change it. The draft is created with its first line; its id then goes into the window's URL
 * (page?formTitle=…&idParam=id), so the window opens it again.
 *
 * @param emptyHeader the header of a new document
 * @param headerFrom  the header of a document the backend sent
 * @param headerBody  what the backend takes for a header
 */
export function useDocument({ api, documentId, formId, formTitle, page, idParam, emptyHeader, headerFrom,
  headerBody }) {
  const { csrfFetch } = useContext(AuthContext);
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const { data: document, error: loadError, mutate } = useSWR(
    documentId ? `${api}/${documentId}` : null, fetchJson, { revalidateOnFocus: false });

  // The header: for a new document, what's entered; for a draft, what it has (reset whenever it's loaded again).
  // Set during render, not in an effect, so the stale header is never shown:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [header, setHeader] = useState(emptyHeader);
  const [headerLoadedFrom, setHeaderLoadedFrom] = useState(null);
  if (document && document !== headerLoadedFrom) {
    setHeaderLoadedFrom(document);
    setHeader(headerFrom(document));
  }

  const { send, busy, errorMessage, setErrorMessage } = useDocumentRequests(csrfFetch);
  const posted = document?.status === 'POSTED';

  /** Shows the document a request answered with, or loads it again if the request failed. */
  const show = (saved) => mutate(saved ?? undefined, { revalidate: !saved });

  const openInWindow = (id) => updateOpenFormUrl(`${page}?formTitle=${encodeURIComponent(formTitle)}${
    id == null ? '' : `&${idParam}=${encodeURIComponent(id)}`}`);

  /** A header change: kept until the draft exists, saved at once on a draft (pass save = false for a text). */
  const changeHeader = async (changes, save = true) => {
    setHeader((previous) => ({ ...previous, ...changes }));
    if (save && document && !posted) {
      await show(await send(`${api}/${document.id}`, 'PUT', headerBody({ ...header, ...changes })));
    }
  };

  /** Saves a text of the header when it's left, if it isn't what the document has (stored). */
  const saveTextOnBlur = (field, stored) => () => {
    if (document && !posted && (stored ?? '') !== header[field].trim()) {
      changeHeader({});
    }
  };

  /**
   * PUTs the body to the draft's path (e.g. "/lines"), creating the draft first if there's none yet; returns what
   * the backend answered with, or null if it failed.
   */
  const saveToDraft = async (path, body) => {
    let id = document?.id;
    if (!id) {
      const created = await send(api, 'POST', headerBody(header));
      if (!created) {
        return null;
      }
      id = created.id;
    }
    const saved = await send(`${api}/${id}${path}`, 'PUT', body);
    if (document) {
      await show(saved);
    } else {
      // From now on the window opens this draft (and loads it, with the line if it was saved)
      openInWindow(id);
    }
    return saved;
  };

  /** Sends a request to the document's path (e.g. "/post") and shows what it answers with. */
  const request = async (path, method) => show(await send(`${api}/${document.id}${path}`, method));

  /** A new document in the window, its header cleared. */
  const openNew = () => {
    openInWindow(null);
    // headerLoadedFrom stays the document just left: until the URL has changed, it's still the one loaded, and
    // forgetting it would load its header back over the cleared one
    setHeader(emptyHeader);
    setErrorMessage(null);
  };

  /** Deletes the draft once the user confirms the question; true if it was deleted. */
  const deleteDraft = async (question) => window.confirm(question)
    && (await send(`${api}/${document.id}`, 'DELETE')) != null;

  return {
    document, loadError, header, changeHeader, saveTextOnBlur, busy, errorMessage, setErrorMessage, posted,
    saveToDraft, request, openNew, deleteDraft,
  };
}

/** The document's title and its status. */
export function DocumentTitle({ title, status }) {
  return <>
    <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</Typography>
    <Chip size="small" label={status.label} color={status.color} sx={{ flexShrink: 0 }} />
  </>;
}

/** The status of a document: new, draft, or posted with its journal entry (labels in the document's gender). */
export function documentStatus(document, { newLabel, postedLabel }) {
  if (!document) {
    return { label: newLabel, color: 'default' };
  }
  return document.status === 'POSTED'
    ? { label: `${postedLabel} · قيد ${document.journalEntryId}`, color: 'success' }
    : { label: 'مسودة', color: 'warning' };
}

/** A label and its field side by side, so the header stays one line high; basis: its share of the line. */
export function Labelled({ id, label, basis, children }) {
  return <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flex: `1 1 ${basis}px`, minWidth: 0 }}>
    <Typography component="label" id={id} variant="body2" sx={{ whiteSpace: 'nowrap' }}>{label}</Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Stack>;
}

/** A combobox in the header, beside its label. */
export function HeaderCombobox({ id, label, basis, options, value, disabled, placeholder = 'اختر…', onChange }) {
  return <Labelled id={id} label={label} basis={basis}>
    <Combobox {...COMBOBOX_PROPS} aria-labelledby={id} options={options} value={value} disabled={disabled}
      placeholder={placeholder} onChange={(next) => next != null && onChange(next)} />
  </Labelled>;
}

/** The header's description: saved when it's left. */
export function DescriptionField({ value, disabled, onChange, onBlur }) {
  return <TextField size="small" placeholder="البيان" value={value} disabled={disabled}
    sx={{ flex: '1 1 160px', minWidth: 0 }} error={value.length > MAX_DESCRIPTION_LENGTH}
    slotProps={{ htmlInput: { 'aria-label': 'البيان' } }}
    onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />;
}

/**
 * The entry row's product, with its error under it. A product's barcode (its option's code) picks it: scanned into
 * the field, Enter then moves on to the next one; a barcode no product has is shown under it.
 */
export function ProductField({ productRef, options, value, onChange, error, placeholder = 'اختر الصنف…' }) {
  const [unknownCode, setUnknownCode] = useState(null);
  const shownError = unknownCode != null ? `لا يوجد صنف بالباركود ${unknownCode}` : error;
  return <Box sx={{ flex: 2, minWidth: 170 }}>
    <Combobox {...COMBOBOX_PROPS} ref={productRef} aria-label="الصنف" options={options} value={value}
      placeholder={placeholder} onUnknownCode={setUnknownCode}
      onChange={(next) => {
        setUnknownCode(null);
        onChange(next);
      }} />
    {shownError && <Typography variant="caption" color="error"><bdi>{shownError}</bdi></Typography>}
  </Box>;
}

/**
 * A text field of an entry row, left to right: numeric (whole units), decimal (a percent), text, or a batch number
 * (upper case, as printed on the box and as the backend keeps it).
 */
export function EntryField({ label, value, onChange, inputRef, error, kind = 'text', placeholder, disabled, minWidth = 90,
  helperText }) {
  const inputMode = kind === 'numeric' ? 'numeric' : kind === 'decimal' ? 'decimal' : undefined;
  return <TextField size="small" label={label} value={value} placeholder={placeholder} disabled={disabled}
    sx={{ flex: 1, minWidth }} inputRef={inputRef} error={!!error} helperText={error ?? helperText}
    onChange={(event) => onChange(kind === 'batch' ? event.target.value.toUpperCase() : event.target.value)}
    slotProps={{ inputLabel: { shrink: placeholder ? true : undefined }, htmlInput: { inputMode, dir: 'ltr' } }} />;
}

/**
 * An expiry date as it's typed (utils/expiryDates): a month and year ("05/2027") is the month's first day. When it's
 * left, a date it reads is shown in full (01/05/2027), and one it can't read is marked.
 */
export function ExpiryField({ value, onChange, inputRef, error }) {
  const [left, setLeft] = useState(false);
  const unreadable = left && value.trim() !== '' && parseExpiry(value) == null;
  return <TextField size="small" label="الصلاحية" placeholder="شهر/سنة" value={value} sx={{ flex: 1, minWidth: 120 }}
    inputRef={inputRef} error={!!error || unreadable} helperText={error ?? (unreadable ? 'تاريخ غير صحيح' : undefined)}
    onChange={(event) => {
      setLeft(false);
      onChange(event.target.value);
    }}
    onBlur={() => {
      setLeft(true);
      const date = parseExpiry(value);
      if (date) {
        onChange(formatExpiry(date));
      }
    }}
    slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />;
}

/** What an entry row's expiry date is: the ISO date, or the error to show. */
export function checkExpiry(text) {
  if (text.trim() === '') {
    return { error: REQUIRED };
  }
  const date = parseExpiry(text);
  return date ? { date } : { error: 'تاريخ غير صحيح' };
}

/** What an entry row's batch number is: the trimmed number in upper case, or the error to show. */
export function checkBatchNumber(text) {
  const number = text.trim().toUpperCase();
  if (number === '') {
    return { error: REQUIRED };
  }
  return number.length > MAX_BATCH_NUMBER_LENGTH ? { error: `الحد الأقصى ${MAX_BATCH_NUMBER_LENGTH} حرف` } : { number };
}

/** The entry row: its fields in a line, Enter moving from one to the next (see moveOnEnter). */
export function EntryRow({ fieldRefs, children }) {
  return <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexShrink: 0 }}
    onKeyDown={(event) => moveOnEnter(event, fieldRefs)}>
    {children}
  </Stack>;
}

/** The entry row's OK button: sends the line; "تحديث" when it replaces one. */
export function OkButton({ okRef, busy, onClick, updating }) {
  return <Button ref={okRef} variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={onClick}
    sx={{ flexShrink: 0, height: 40, minWidth: 96 }}>
    {updating ? 'تحديث' : 'OK'}
  </Button>;
}

const modules = [AllCommunityModule];

/** A column of amounts (decimal text), formatted. */
export const amountColumn = (field, headerName, minWidth = 90) => ({
  field, headerName, flex: 1, minWidth, valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
});

/** The expiry date column (dd/mm/yyyy). */
export const expiryColumn = (field = 'expiryDate') => ({
  field, headerName: 'الصلاحية', flex: 1, minWidth: 105, cellStyle: NUMBER_CELL,
  valueFormatter: ({ value }) => formatExpiry(value),
});

/** A column with each row's delete button (none on a pinned total row); none on a posted document. */
export const deleteColumn = (posted, busy, onDelete, nameOf = (data) => data.productName) => (posted ? [] : [{
  headerName: '', colId: 'delete', width: 56, resizable: false,
  cellRenderer: ({ data, node }) => (node.rowPinned ? null
    : <IconButton size="small" aria-label={`حذف ${nameOf(data)}`} disabled={busy} onClick={() => onDelete(data)}>
      <DeleteIcon fontSize="small" />
    </IconButton>),
}]);

/** A grid of the document's rows; a click on a row (not on its buttons) edits it, unless the document is posted. */
export function LinesGrid({ rows, columnDefs, pinnedBottomRowData, posted, onEdit, emptyText, minHeight = 160,
  flex = 1 }) {
  return <Box sx={{ flex, minHeight }}>
    <AgGridProvider modules={modules}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        pinnedBottomRowData={pinnedBottomRowData}
        getRowId={({ data }) => String(data.id)}
        onRowClicked={({ data, node, event }) => !posted && !node.rowPinned
          && !event?.target?.closest?.('button') && onEdit(data)}
        rowStyle={posted ? undefined : { cursor: 'pointer' }}
        defaultColDef={{ sortable: false, resizable: true, wrapHeaderText: true, autoHeaderHeight: true }}
        enableRtl
        enableCellTextSelection
        ensureDomOrder
        overlayNoRowsTemplate={`<span>${emptyText}</span>`}
      />
    </AgGridProvider>
  </Box>;
}

/** One of the totals under the grid: its label and its amount. */
export function Total({ label, value, strong }) {
  return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 700 : 400, ...NUMBER_CELL }}>
      <bdi>{value == null ? '—' : formatAmount(value)}</bdi>
    </Typography>
  </Stack>;
}

/**
 * The actions under the grid: for a draft, its next step (posting by default) and deleting it; "جديد" once there's a
 * document; then the totals (children), at the far end.
 */
export function DocumentActions({ document, posted, busy, nextStep, onDeleteDraft, onNew, children }) {
  return <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    {document && !posted && <>
      <Button variant="contained" color="success" startIcon={nextStep.icon ?? <SendIcon />}
        disabled={busy || nextStep.disabled} onClick={nextStep.onClick}>
        {nextStep.label ?? 'ترحيل'}
      </Button>
      <Button color="error" startIcon={<DeleteForeverIcon />} disabled={busy} onClick={onDeleteDraft}>
        حذف المسودة
      </Button>
    </>}
    {document && <Button startIcon={<AddIcon />} disabled={busy} onClick={onNew}>جديد</Button>}
    <Box sx={{ flex: 1 }} />
    {children}
  </Stack>;
}

/**
 * For an entry row's onKeyDown: Enter moves to the next of the fields (refs, in order; the last is the OK button,
 * where Enter is a click, which sends the line), skipping disabled ones. Not when ComboBox2 used it to pick from its
 * open list (it prevents the default then), nor in a field not in the list.
 */
export function moveOnEnter(event, fieldRefs) {
  if (event.key !== 'Enter' || event.defaultPrevented) {
    return;
  }
  const index = fieldRefs.findIndex((ref) => ref.current === event.target);
  // The next field that can take the cursor (a disabled one is skipped)
  const next = index >= 0 ? fieldRefs.slice(index + 1).find((ref) => ref.current && !ref.current.disabled) : undefined;
  if (next?.current) {
    event.preventDefault();
    next.current.focus();
    next.current.select?.();
  }
}
