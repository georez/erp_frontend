'use client';

import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Combobox } from '@/components/ui/ComboBox2';
import { normalizeDecimalText } from '@/utils/decimals';
import { fetchJson } from '@/utils/fetchJson';
import { partyKind } from '@/utils/journalEntries';
import { checkCashDocument, isOverBalance } from '@/utils/cashDocuments';
import { linkTarget } from '@/utils/reportutils';
import { useOpenLink } from '@/utils/useOpenLink';
import { formatAmount } from './document/amounts';
import { COMBOBOX_PROPS, useAccountOptions, useOptions } from './document/comboboxOptions';
import { DocumentActions } from './document/DocumentActions';
import { DocumentTitle, HeaderRow, Labelled } from './document/DocumentHeader';
import { DocumentAlerts, DocumentWindow } from './document/DocumentLayout';
import { moveOnEnter } from './document/EntryFields';
import { hasErrors } from './document/entryChecks';
import { useDocument } from './document/useDocument';
import { WindowLink } from './document/WindowLink';
import { openPrintout } from '@/components/print/printPages';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/*
 * The form of a payment or a receipt (PaymentForm, ReceiptForm): money moving between a cash box or bank account and any
 * other account. It has no lines: all of it is in the form. The first save creates the draft; after that a field is
 * saved when it's left, and a choice when it's made. A posted document never changes, and is cancelled by reversing it
 * (عكس السند). The list of cash accounts shows what's in each.
 */

const EMPTY_HEADER = {
  cashAccountId: null, accountId: null, customerId: null, supplierId: null, amount: '', documentDatetime: '',
  reference: '', description: '',
};

// "2026-10-31T23:59:00" → "2026-10-31T23:59", as a datetime-local field holds it
const headerFrom = (loaded) => ({
  cashAccountId: loaded.cashAccountId,
  accountId: loaded.accountId,
  customerId: loaded.customerId,
  supplierId: loaded.supplierId,
  amount: loaded.amount,
  documentDatetime: loaded.documentDatetime ? loaded.documentDatetime.slice(0, 16) : '',
  reference: loaded.reference ?? '',
  description: loaded.description ?? '',
});
const headerBody = (header) => ({
  cashAccountId: header.cashAccountId,
  accountId: header.accountId,
  customerId: header.customerId,
  supplierId: header.supplierId,
  amount: normalizeDecimalText(header.amount),
  documentDatetime: header.documentDatetime || null,
  reference: header.reference.trim() || null,
  description: header.description.trim() || null,
});

const PARTY_LABELS = { customer: 'العميل', supplier: 'المورد' };

/** The cash boxes and bank accounts as combobox options, each with its balance beside it. */
function useCashAccounts(api) {
  const { data = [], error, mutate } = useSWR(`${api}/cash-accounts`, fetchJson);
  const options = data.map((account) => ({ ...account, detail: formatAmount(account.balance) }));
  return { options, error, reload: mutate };
}

/** The status chip: new, draft, posted, or reversed. */
function documentStatus(document) {
  if (!document) {
    return { label: 'جديد', color: 'default' };
  }
  if (document.reversalEntryId) {
    return { label: `معكوس · قيد ${document.reversalEntryId}`, color: 'error' };
  }
  if (document.status === 'POSTED') {
    return { label: `مُرحَّل · قيد ${document.journalEntryId}`, color: 'success' };
  }
  return { label: 'مسودة', color: 'warning' };
}

/** A link to a journal entry, opening it in a window. */
function EntryLink({ entryId, openLink }) {
  const target = linkTarget({ documentColumn: 'page', idColumn: 'id' }, { page: 'journal-entry', id: entryId });
  return <WindowLink target={target} openLink={openLink}>{`القيد ${entryId}`}</WindowLink>;
}

/** What became of a posted document: its entry, the one reversing it, and who posted it. */
function DocumentOrigin({ document, openLink }) {
  return <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    <Typography variant="body2">
      قيد السند: <EntryLink entryId={document.journalEntryId} openLink={openLink} />
    </Typography>
    {document.reversalEntryId && <Typography variant="body2" color="error">
      عُكس بـ<EntryLink entryId={document.reversalEntryId} openLink={openLink} />
    </Typography>}
    {document.postedBy && <Typography variant="body2" color="text.secondary">
      رحّله <bdi>{document.postedBy}</bdi>
    </Typography>}
  </Stack>;
}

/** A field of the form beside its label, with its error under it. */
function Field({ id, label, error, children }) {
  return <Box sx={{ minWidth: 0 }}>
    <Labelled id={id} label={label} basis={300}>{children}</Labelled>
    {error && <Typography variant="caption" color="error">{error}</Typography>}
  </Box>;
}

/**
 * @param kind       what makes it a payment or a receipt: { api, page, printout, idParam, name, theName, cashLabel,
 *                   accountLabel, dateLabel, warnsOverBalance }; printout names its printout (printPages)
 * @param documentId the document the window shows; none for a new one
 */
export function CashDocumentForm({ kind: documentKind, formId, formTitle, documentId }) {
  const openLink = useOpenLink();
  const cashAccounts = useCashAccounts(documentKind.api);
  const accounts = useAccountOptions();
  const customers = useOptions('customers');
  const suppliers = useOptions('suppliers');
  const confirm = useConfirm();
  const doc = useDocument({
    api: documentKind.api, documentId, formId, formTitle, page: documentKind.page,
    idParam: documentKind.idParam, emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: cashDocument, header, editable } = doc;
  const [triedToSave, setTriedToSave] = useState(false);

  const cashRef = useRef(null);
  const accountRef = useRef(null);
  const partyRef = useRef(null);
  const amountRef = useRef(null);
  const datetimeRef = useRef(null);
  const referenceRef = useRef(null);
  const descriptionRef = useRef(null);
  const saveRef = useRef(null);
  const fieldRefs = [cashRef, accountRef, partyRef, amountRef, datetimeRef, referenceRef, descriptionRef, saveRef];

  const subledgerOf = (accountId) => accounts.options.find((option) => option.value === accountId)?.subledger ?? null;
  const kind = partyKind(subledgerOf(header.accountId));
  const partyOptions = kind === 'customer' ? customers.options : suppliers.options;
  const partyId = kind === 'customer' ? header.customerId : header.supplierId;

  const errors = checkCashDocument(header, subledgerOf(header.accountId));
  // A new document starts empty: its errors wait for the first save
  const shownErrors = doc.isDraft || triedToSave ? errors : {};

  const cashAccount = cashAccounts.options.find((option) => option.value === header.cashAccountId);
  const overBalance = documentKind.warnsOverBalance && editable
    && isOverBalance(header.amount, cashAccount?.balance ?? null);
  const balanceWarning = overBalance
    ? `المبلغ أكبر من رصيد "${cashAccount.label}" (${formatAmount(cashAccount.balance)})؛ يمكنك الاستمرار إن كان ذلك صحيحاً`
    : null;

  /** Saves a draft unless a field is wrong: what the user sees then stays as typed, with its error under the field. */
  const saveIfComplete = (next = header) => {
    if (!hasErrors(checkCashDocument(next, subledgerOf(next.accountId)))) {
      doc.saveHeader(next);
    }
  };

  /** A choice made (a combobox): kept, and saved at once. */
  const choose = (changes) => {
    doc.editHeader(changes);
    saveIfComplete({ ...header, ...changes });
  };

  /** A new account: its party stays only if the new account takes the same kind of party. */
  const changeAccount = (accountId) => {
    const nextKind = partyKind(subledgerOf(accountId));
    choose({
      accountId,
      customerId: nextKind === 'customer' ? header.customerId : null,
      supplierId: nextKind === 'supplier' ? header.supplierId : null,
    });
  };

  const changeParty = (id) => choose(kind === 'customer' ? { customerId: id } : { supplierId: id });

  /** The first save creates the draft, and the window opens it. */
  const saveNew = () => {
    setTriedToSave(true);
    if (!hasErrors(errors)) {
      doc.createFromHeader();
    }
  };

  const newDocument = () => {
    doc.openNew();
    setTriedToSave(false);
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة ${documentKind.theName} رقم ${cashDocument.id}؟`)) {
      newDocument();
    }
  };

  /** Posting and reversing change what the cash accounts hold. */
  const sendAndReloadBalances = async (path) => {
    await doc.sendToDraft(path, 'POST');
    await cashAccounts.reload();
  };

  const reverse = async () => {
    const confirmed = await confirm({
      title: `عكس ${documentKind.theName} رقم ${cashDocument.id}؟`, message: 'يُرحَّل قيد يلغي أثره، ويسري الآن.',
      confirmLabel: 'عكس', color: 'error',
    });
    if (confirmed) {
      sendAndReloadBalances('/reverse');
    }
  };

  return <DocumentWindow>
    <HeaderRow>
      <DocumentTitle title={cashDocument ? `${documentKind.name} رقم ${cashDocument.id}` : `${documentKind.name} جديد`}
        status={documentStatus(cashDocument)} />
    </HeaderRow>

    {doc.isPosted && <DocumentOrigin document={cashDocument} openLink={openLink} />}

    <DocumentAlerts loadError={doc.loadError}
      optionsError={cashAccounts.error ?? accounts.error ?? customers.error ?? suppliers.error}
      headerWarning={balanceWarning} />

    <Box onKeyDown={(event) => moveOnEnter(event, fieldRefs)} sx={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 1.5, flexShrink: 0,
    }}>
      <Field id={`${formId}-cash`} label={documentKind.cashLabel} error={shownErrors.cashAccountId}>
        <Combobox {...COMBOBOX_PROPS} ref={cashRef} aria-labelledby={`${formId}-cash`} options={cashAccounts.options}
          value={header.cashAccountId} disabled={!editable} placeholder="اختر الخزينة أو البنك…"
          onChange={(cashAccountId) => choose({ cashAccountId })} />
      </Field>
      <Field id={`${formId}-account`} label={documentKind.accountLabel} error={shownErrors.accountId}>
        <Combobox {...COMBOBOX_PROPS} ref={accountRef} aria-labelledby={`${formId}-account`} options={accounts.options}
          value={header.accountId} disabled={!editable} placeholder="اختر الحساب…" onChange={changeAccount} />
      </Field>
      <Field id={`${formId}-party`} label={kind ? PARTY_LABELS[kind] : 'الطرف'} error={shownErrors.partyId}>
        <Combobox {...COMBOBOX_PROPS} ref={partyRef} aria-labelledby={`${formId}-party`} options={kind ? partyOptions : []}
          value={partyId} disabled={!editable || !kind} onChange={changeParty}
          placeholder={kind ? `اختر ${PARTY_LABELS[kind]}…` : 'لا طرف لهذا الحساب'} />
      </Field>
      <Field id={`${formId}-amount`} label="المبلغ" error={shownErrors.amount}>
        <TextField size="small" fullWidth value={header.amount} disabled={!editable} inputRef={amountRef}
          error={!!shownErrors.amount} onChange={(event) => doc.editHeader({ amount: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr', 'aria-labelledby': `${formId}-amount` } }} />
      </Field>
      <Field id={`${formId}-datetime`} label={documentKind.dateLabel}>
        <TextField size="small" type="datetime-local" fullWidth value={header.documentDatetime} disabled={!editable}
          inputRef={datetimeRef} helperText={editable && !header.documentDatetime ? 'فارغ: عند الترحيل' : undefined}
          onChange={(event) => doc.editHeader({ documentDatetime: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { dir: 'ltr', 'aria-labelledby': `${formId}-datetime` } }} />
      </Field>
      <Field id={`${formId}-reference`} label="رقم المرجع" error={shownErrors.reference}>
        <TextField size="small" fullWidth value={header.reference} disabled={!editable} inputRef={referenceRef}
          placeholder="رقم الشيك أو التحويل" error={!!shownErrors.reference}
          onChange={(event) => doc.editHeader({ reference: event.target.value })} onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { dir: 'ltr', 'aria-labelledby': `${formId}-reference` } }} />
      </Field>
      <Field id={`${formId}-description`} label="البيان" error={shownErrors.description}>
        <TextField size="small" fullWidth value={header.description} disabled={!editable} inputRef={descriptionRef}
          error={!!shownErrors.description} onChange={(event) => doc.editHeader({ description: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { 'aria-labelledby': `${formId}-description` } }} />
      </Field>
    </Box>

    <Box sx={{ flex: 1 }} />

    <DocumentActions isNew={doc.isNew} isDraft={doc.isDraft} pending={doc.pending}
      newStep={{ onClick: saveNew, label: 'حفظ', icon: <SaveIcon /> }} newStepRef={saveRef}
      nextStep={{ onClick: () => sendAndReloadBalances('/post'), disabled: hasErrors(errors) }}
      onDeleteDraft={deleteThisDraft} onNew={newDocument}
      onPrint={cashDocument ? () => openPrintout(documentKind.printout, cashDocument.id) : undefined}>
      {cashDocument?.canBeReversed && <Button color="error" startIcon={<UndoIcon />} disabled={doc.pending > 0}
        onClick={reverse}>عكس السند</Button>}
    </DocumentActions>
  </DocumentWindow>;
}
