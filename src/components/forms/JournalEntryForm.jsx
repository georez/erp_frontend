'use client';

import UndoIcon from '@mui/icons-material/Undo';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, TextField, Typography,
} from '@mui/material';
import { Big } from 'bigdecimal.js';
import { useRef, useState } from 'react';
import { Combobox } from '@/components/ui/ComboBox2';
import { reportPageUrl } from '@/components/reports/useReportPage';
import { parseWholeUnits } from '@/utils/decimals';
import { checkLineAmounts, documentPageOf, partyKind, statementPeriod } from '@/utils/journalEntries';
import { linkTarget } from '@/utils/reportutils';
import { useOpenLink } from '@/utils/useOpenLink';
import { formatAmount, isNonZero } from './document/amounts';
import { COMBOBOX_PROPS, useAccountOptions, useOptions } from './document/comboboxOptions';
import { DocumentActions, Total } from './document/DocumentActions';
import { DescriptionField, DocumentTitle, HeaderRow, Labelled } from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow, NEW_DOCUMENT_HINT } from './document/DocumentLayout';
import { EntryField, EntryRow, OkButton } from './document/EntryFields';
import { hasErrors, MAX_DESCRIPTION_LENGTH } from './document/entryChecks';
import { amountColumn, deleteColumn, LinesGrid, textColumn } from './document/LinesGrid';
import { useDocument } from './document/useDocument';
import { useEntryRow } from './document/useEntryRow';
import { WindowLink } from './document/WindowLink';
import { openPrintout } from '@/components/print/printPages';

/*
 * The journal entry form: any journal entry with its lines, and manual entries made here.
 *
 * - A manual entry, for what no document posts: its header (when it takes effect, description) is saved as it's left,
 *   and its lines are entered one at a time: an account, the customer or supplier its control account needs, the
 *   amount on one side, a description. The first line's OK creates the draft. Posting needs it balanced; a posted
 *   manual entry never changes, and is cancelled by reversing it (عكس القيد).
 * - A document's entry (an invoice's, a return's...) is read-only here, with a link to its document.
 *
 * Each line opens its subledger: its account's statement, its customer's or supplier's statement, and on an entry
 * that moved stock, its Inventory line opens the entry's stock movements.
 */

const EMPTY_HEADER = { description: '', entryDatetime: '' };
// lineId: the line being changed, or null for a new one
const EMPTY_ENTRY = { lineId: null, accountId: null, partyId: null, debit: '', credit: '', description: '' };

// "2026-10-31T23:59:00" → "2026-10-31T23:59", as a datetime-local field holds it
const headerFrom = (loaded) => ({
  description: loaded.description ?? '',
  entryDatetime: loaded.entryDatetime ? loaded.entryDatetime.slice(0, 16) : '',
});
const headerBody = (header) => ({
  description: header.description.trim() || null,
  entryDatetime: header.entryDatetime || null,
});

const PARTIES = {
  customer: { label: 'العميل', missing: 'حدّد العميل', page: 'customer-statement', title: 'كشف حساب عميل',
    param: 'p_customer_id' },
  supplier: { label: 'المورد', missing: 'حدّد المورد', page: 'supplier-statement', title: 'كشف حساب مورد',
    param: 'p_supplier_id' },
};

/** What a new entry's header lacks for its first line to be sent, or null. */
function headerProblem(header) {
  if (header.description.length > MAX_DESCRIPTION_LENGTH) {
    return `البيان أطول من المسموح (الحد الأقصى ${MAX_DESCRIPTION_LENGTH} حرف)`;
  }
  return null;
}

/** The entry row's errors by field, and the line to send when it has none. */
function checkEntry(entry, subledgerOf) {
  const kind = partyKind(subledgerOf(entry.accountId));
  const amounts = checkLineAmounts(entry.debit, entry.credit);
  const errors = {
    accountId: entry.accountId == null ? 'حدّد الحساب' : null,
    partyId: kind && entry.partyId == null ? PARTIES[kind].missing : null,
    debit: amounts.errors?.debit,
    credit: amounts.errors?.credit,
    description: entry.description.length > MAX_DESCRIPTION_LENGTH ? `الحد الأقصى ${MAX_DESCRIPTION_LENGTH} حرف` : null,
  };
  if (hasErrors(errors)) {
    return { errors, line: null };
  }
  const line = {
    accountId: entry.accountId,
    customerId: kind === 'customer' ? entry.partyId : null,
    supplierId: kind === 'supplier' ? entry.partyId : null,
    debit: amounts.debit,
    credit: amounts.credit,
    description: entry.description.trim() || null,
  };
  return { errors, line };
}

/** A line of the entry as the entry row shows it, to change it. */
const entryFromLine = (line) => ({
  lineId: line.id,
  accountId: line.accountId,
  partyId: line.customerId ?? line.supplierId,
  debit: isNonZero(line.debit) ? line.debit : '',
  credit: isNonZero(line.credit) ? line.credit : '',
  description: line.description ?? '',
});

// --- what a line opens ---

/** The URL of the stock movements report, showing the entry's movements only. */
function stockMovementsUrl(entryId) {
  const query = { combinator: 'and', rules: [{ field: 'journal_entry_id', operator: '=', value: String(entryId) }] };
  return `/dashboard/report?reportName=stockMovementsReport&formTitle=${encodeURIComponent('حركات المخزون')}`
    + `&query=${encodeURIComponent(JSON.stringify(query))}&execute=true&requestTime=${Date.now()}`;
}

/** The account's statement for the period the line falls in. */
function accountStatement(line, period) {
  const title = 'كشف حساب';
  return { url: reportPageUrl('account-statement', title, { p_account_id: line.accountId, ...period }), title };
}

/** The line's subledger: its customer's or supplier's statement, or the entry's stock movements; or null. */
function subledgerTarget(line, entry, period) {
  const kind = partyKind(line.subledger);
  if (kind) {
    const party = PARTIES[kind];
    const partyId = kind === 'customer' ? line.customerId : line.supplierId;
    return { url: reportPageUrl(party.page, party.title, { [party.param]: partyId, ...period }), title: party.title };
  }
  if (line.subledger === 'INVENTORY' && entry.movesStock) {
    return { url: stockMovementsUrl(entry.id), title: 'حركات المخزون' };
  }
  return null;
}

/** A debit or credit column: a line's other side, zero, is left empty so its amount stands out; the total shows both. */
const oneSidedAmountColumn = (field, headerName) => ({
  ...amountColumn(field, headerName, 110),
  valueFormatter: ({ value, node }) => (node.rowPinned || isNonZero(value) ? formatAmount(value) : ''),
});

const gridColumns = ({ entry, period, readOnly, openLink, onDelete }) => {
  const isTotal = (node) => node.rowPinned;
  return [
    { headerName: '#', colId: 'number', width: 56, valueGetter: ({ node }) => (isTotal(node) ? '' : node.rowIndex + 1) },
    {
      ...textColumn('accountName', 'الحساب', { flex: 2, minWidth: 160 }),
      cellRenderer: ({ data, node }) => (isTotal(node) ? data.accountName
        : <WindowLink target={accountStatement(data, period)} openLink={openLink}>{data.accountName}</WindowLink>),
    },
    {
      ...textColumn('partyName', 'الطرف / الحساب المساعد', { flex: 2, minWidth: 160 }),
      cellRenderer: ({ data, node }) => {
        const target = !isTotal(node) && entry ? subledgerTarget(data, entry, period) : null;
        if (!target) {
          return data.partyName ?? '';
        }
        return <WindowLink target={target} openLink={openLink}>{data.partyName ?? target.title}</WindowLink>;
      },
    },
    textColumn('description', 'البيان', { flex: 2, minWidth: 140 }),
    oneSidedAmountColumn('debit', 'مدين'),
    oneSidedAmountColumn('credit', 'دائن'),
    ...deleteColumn(readOnly, onDelete, (row) => row.accountName),
  ];
};

// --- the header's parts ---

/** The status chip: new, draft, posted, or reversed (another entry reverses it), as cash documents show it. */
function entryStatus(entry) {
  if (!entry) {
    return { label: 'جديد', color: 'default' };
  }
  if (entry.reversedByEntryId) {
    return { label: 'معكوس', color: 'error' };
  }
  return entry.status === 'POSTED' ? { label: 'مُرحَّل', color: 'success' } : { label: 'مسودة', color: 'warning' };
}

/**
 * Where the entry comes from and what became of it: its document (opened as a window), or "manual"; the entry it
 * reverses and the one reversing it (opened here).
 */
function EntryOrigin({ entry, openLink, onOpenEntry }) {
  const page = documentPageOf(entry.sourceType);
  const documentTarget = page ? linkTarget({ documentColumn: 'page', idColumn: 'sourceId' },
    { page, sourceId: entry.sourceId }) : null;
  const entryLink = (id, text) => <Link component="button" type="button" variant="body2"
    onClick={() => onOpenEntry(id)}>{text}</Link>;

  return <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    {entry.manual && <Chip size="small" variant="outlined" label="قيد يدوي" />}
    {documentTarget && <Typography variant="body2">
      قيد المستند: <WindowLink target={documentTarget} openLink={openLink}>
        {`${documentTarget.title} ${entry.sourceId}`}</WindowLink>
    </Typography>}
    {entry.sourceType && !documentTarget && <Typography variant="body2">{`مستند ${entry.sourceType} ${entry.sourceId}`}
    </Typography>}
    {entry.reversesEntryId && <Typography variant="body2">
      يعكس {entryLink(entry.reversesEntryId, `القيد ${entry.reversesEntryId}`)}
    </Typography>}
    {entry.reversedByEntryId && <Typography variant="body2" color="error">
      عُكس بـ{entryLink(entry.reversedByEntryId, `القيد ${entry.reversedByEntryId}`)}
    </Typography>}
    {entry.postedBy && <Typography variant="body2" color="text.secondary">
      رحّله <bdi>{entry.postedBy}</bdi>
    </Typography>}
  </Stack>;
}

/** Typing an entry's number opens it in the window (Enter). */
function OpenEntryField({ onOpenEntry }) {
  const [typed, setTyped] = useState('');
  const open = () => {
    const number = parseWholeUnits(typed);
    if (number != null && number !== '0') {
      onOpenEntry(number);
      setTyped('');
    }
  };
  return <TextField size="small" placeholder="فتح قيد رقم…" value={typed} sx={{ width: 140 }}
    onChange={(event) => setTyped(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        open();
      }
    }}
    slotProps={{ htmlInput: { inputMode: 'numeric', dir: 'ltr', 'aria-label': 'فتح قيد رقم' } }} />;
}

/**
 * Reversing a posted manual entry: when the reversal takes effect (empty: now; not before the entry itself) and its
 * description (empty: "عكس القيد رقم N").
 */
function ReverseDialog({ open, entryId, onClose, onReverse }) {
  const [entryDatetime, setEntryDatetime] = useState('');
  const [description, setDescription] = useState('');
  const reverse = () => {
    onReverse({ entryDatetime: entryDatetime || null, description: description.trim() || null });
    onClose();
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>{`عكس القيد رقم ${entryId}`}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          يُرحَّل قيد بنفس السطور مع تبديل المدين والدائن، فيلغي أثر هذا القيد.
        </Typography>
        <TextField size="small" type="datetime-local" label="يسري في" value={entryDatetime}
          helperText="فارغ: الآن. لا يسبق تاريخ القيد نفسه" onChange={(event) => setEntryDatetime(event.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />
        <TextField size="small" label="البيان" value={description} placeholder={`عكس القيد رقم ${entryId}`}
          error={description.length > MAX_DESCRIPTION_LENGTH} onChange={(event) => setDescription(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>إلغاء</Button>
      <Button variant="contained" color="error" startIcon={<UndoIcon />} onClick={reverse}
        disabled={description.length > MAX_DESCRIPTION_LENGTH}>عكس القيد</Button>
    </DialogActions>
  </Dialog>;
}

export default function JournalEntryForm({ formId, formTitle, entryId }) {
  const openLink = useOpenLink();
  const accounts = useAccountOptions();
  const customers = useOptions('customers');
  const suppliers = useOptions('suppliers');
  const doc = useDocument({
    api: '/api/journal-entries', documentId: entryId, formId, formTitle, page: '/dashboard/journal-entry',
    idParam: 'entryId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: entry, header } = doc;
  // A document's entry is read-only here; a manual one while it's a draft (or new, or still loading) is not
  const editable = doc.editable && (entry == null || entry.manual);
  const isManualDraft = doc.isDraft && entry.manual;
  const entryRow = useEntryRow(EMPTY_ENTRY);
  const { entry: typed, setEntry, setField } = entryRow;
  const [reversing, setReversing] = useState(false);

  const accountRef = useRef(null);
  const partyRef = useRef(null);
  const debitRef = useRef(null);
  const creditRef = useRef(null);
  const descriptionRef = useRef(null);
  const okRef = useRef(null);

  const lines = entry?.lines ?? [];
  const subledgerOf = (accountId) => accounts.options.find((option) => option.value === accountId)?.subledger ?? null;
  const kind = partyKind(subledgerOf(typed.accountId));
  const party = kind ? PARTIES[kind] : null;
  const partyOptions = kind === 'customer' ? customers.options : suppliers.options;

  /** A new account: the party stays only if the new account takes the same kind of party. */
  const changeAccount = (accountId) => setEntry((previous) => ({
    ...previous,
    accountId,
    partyId: partyKind(subledgerOf(previous.accountId)) === partyKind(subledgerOf(accountId)) ? previous.partyId : null,
  }));

  /** Sends the line (a new one, or the one being changed); the row is cleared at once for the next one. */
  const saveEntry = () => {
    const headerWarning = doc.isNew ? headerProblem(header) : null;
    const { errors, line } = checkEntry(typed, subledgerOf);
    entryRow.setErrors({ ...errors, header: headerWarning });
    if (headerWarning || !line) {
      return;
    }
    const replacesALine = typed.lineId != null && lines.some((existing) => existing.id === typed.lineId);
    if (replacesALine) {
      doc.sendToDraft(`/lines/${typed.lineId}`, 'PUT', line);
    } else {
      doc.addLine(line, accounts.labelOf(line.accountId));
    }
    entryRow.clear();
    accountRef.current?.focus();
  };

  const openEntry = (id) => {
    entryRow.clear();
    doc.openDocument(id);
  };

  const newEntry = () => {
    doc.openNew();
    entryRow.clear();
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة القيد رقم ${entry.id}؟`)) {
      newEntry();
    }
  };

  const period = statementPeriod(entry?.entryDatetime ?? null, new Date());
  const columnDefs = gridColumns({
    entry, period, readOnly: !editable, openLink,
    onDelete: (line) => doc.sendToDraft(`/lines/${line.id}`, 'DELETE'),
  });
  const total = entry && lines.length > 0
    ? [{ id: 'total', accountName: 'الإجمالي', debit: entry.totalDebit, credit: entry.totalCredit }]
    : undefined;
  const difference = entry ? Big(entry.totalDebit).subtract(Big(entry.totalCredit)).toPlainString() : '0';
  const balanced = !isNonZero(difference) && lines.length > 0 && isNonZero(entry?.totalDebit);

  let emptyText = 'لا توجد سطور';
  if (doc.isNew) {
    emptyText = NEW_DOCUMENT_HINT;
  } else if (editable) {
    emptyText = 'أدخل السطور واحداً واحداً: الحساب والطرف والمبلغ مديناً أو دائناً ثم OK';
  }

  return <DocumentWindow>
    <HeaderRow wrap>
      <DocumentTitle title={entry ? `قيد يومية رقم ${entry.id}` : 'قيد يومية جديد'} status={entryStatus(entry)} />
      <Labelled id={`${formId}-datetime`} label="يسري في" basis={200}>
        <TextField size="small" type="datetime-local" fullWidth value={header.entryDatetime} disabled={!editable}
          helperText={editable && !header.entryDatetime ? 'فارغ: عند الترحيل' : undefined}
          onChange={(event) => doc.editHeader({ entryDatetime: event.target.value })} onBlur={() => doc.saveHeader()}
          slotProps={{ htmlInput: { dir: 'ltr', 'aria-labelledby': `${formId}-datetime` } }} />
      </Labelled>
      <DescriptionField value={header.description} disabled={!editable}
        onChange={(description) => doc.editHeader({ description })} onBlur={() => doc.saveHeader()} />
    </HeaderRow>

    {entry && <EntryOrigin entry={entry} openLink={openLink} onOpenEntry={openEntry} />}

    <DocumentAlerts loadError={doc.loadError} optionsError={accounts.error ?? customers.error ?? suppliers.error}
      headerWarning={entryRow.errors.header} />

    {editable && <EntryRow fieldRefs={[accountRef, partyRef, debitRef, creditRef, descriptionRef, okRef]}>
      <Box sx={{ flex: 2, minWidth: 170 }}>
        <Combobox {...COMBOBOX_PROPS} ref={accountRef} aria-label="الحساب" options={accounts.options}
          value={typed.accountId} placeholder="اختر الحساب…" onChange={changeAccount} />
        {entryRow.errors.accountId && <Typography variant="caption" color="error">{entryRow.errors.accountId}</Typography>}
      </Box>
      <Box sx={{ flex: 2, minWidth: 150 }}>
        <Combobox {...COMBOBOX_PROPS} ref={partyRef} aria-label={party?.label ?? 'الطرف'} options={party ? partyOptions : []}
          value={typed.partyId} disabled={!party} placeholder={party ? `اختر ${party.label}…` : 'لا طرف لهذا الحساب'}
          onChange={setField('partyId')} />
        {entryRow.errors.partyId && <Typography variant="caption" color="error">{entryRow.errors.partyId}</Typography>}
      </Box>
      <EntryField label="مدين" kind="decimal" value={typed.debit} onChange={setField('debit')} inputRef={debitRef}
        error={entryRow.errors.debit} />
      <EntryField label="دائن" kind="decimal" value={typed.credit} onChange={setField('credit')} inputRef={creditRef}
        error={entryRow.errors.credit} />
      <EntryField label="البيان" value={typed.description} onChange={setField('description')}
        inputRef={descriptionRef} error={entryRow.errors.description} minWidth={140} />
      <OkButton okRef={okRef} onClick={saveEntry}
        updating={typed.lineId != null && lines.some((line) => line.id === typed.lineId)} />
    </EntryRow>}

    <LinesGrid rows={lines} columnDefs={columnDefs} pinnedBottomRowData={total} isPosted={!editable}
      onEdit={(line) => entryRow.fill(entryFromLine(line), debitRef)} emptyText={emptyText} />

    <DocumentActions isNew={doc.isNew} isDraft={isManualDraft} pending={doc.pending}
      nextStep={{ onClick: () => doc.sendToDraft('/post', 'POST'), disabled: !balanced }}
      onDeleteDraft={deleteThisDraft} onNew={newEntry}
      onPrint={entry ? () => openPrintout('journal-entry', entry.id) : undefined}>
      {entry?.canBeReversed && <Button color="error" startIcon={<UndoIcon />} disabled={doc.pending > 0}
        onClick={() => setReversing(true)}>عكس القيد</Button>}
      <OpenEntryField onOpenEntry={openEntry} />
      {/* The debits and credits are the grid's total row; what keeps the entry from posting shows here */}
      {isNonZero(difference) && <Total label="الفرق" value={difference} strong />}
    </DocumentActions>

    {entry?.canBeReversed && <ReverseDialog key={entry.id} open={reversing} entryId={entry.id}
      onClose={() => setReversing(false)} onReverse={(body) => doc.sendAndOpenAnswer('/reverse', 'POST', body)} />}
  </DocumentWindow>;
}
