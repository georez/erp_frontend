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
import { checkPayment, isOverBalance } from '@/utils/payments';
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

/*
 * The payment document (سند صرف): money paid out of a cash box or bank account to any other account. A payment has no
 * lines: all of it is in the form. The first save creates the draft; after that a field is saved when it's left, and a
 * choice when it's made. Posting credits the cash account and debits the other one. A posted payment never changes,
 * and is cancelled by reversing it (عكس السند).
 *
 * The list of cash accounts shows what's in each, and paying more than that is warned about, not refused: a bank may
 * allow an overdraft the books don't know.
 */

const EMPTY_HEADER = {
  cashAccountId: null, accountId: null, customerId: null, supplierId: null, amount: '', paymentDatetime: '',
  reference: '', description: '',
};

// "2026-10-31T23:59:00" → "2026-10-31T23:59", as a datetime-local field holds it
const headerFrom = (loaded) => ({
  cashAccountId: loaded.cashAccountId,
  accountId: loaded.accountId,
  customerId: loaded.customerId,
  supplierId: loaded.supplierId,
  amount: loaded.amount,
  paymentDatetime: loaded.paymentDatetime ? loaded.paymentDatetime.slice(0, 16) : '',
  reference: loaded.reference ?? '',
  description: loaded.description ?? '',
});
const headerBody = (header) => ({
  cashAccountId: header.cashAccountId,
  accountId: header.accountId,
  customerId: header.customerId,
  supplierId: header.supplierId,
  amount: normalizeDecimalText(header.amount),
  paymentDatetime: header.paymentDatetime || null,
  reference: header.reference.trim() || null,
  description: header.description.trim() || null,
});

const PARTY_LABELS = { customer: 'العميل', supplier: 'المورد' };

/** The cash boxes and bank accounts as combobox options, each with its balance beside it. */
function useCashAccounts() {
  const { data = [], error, mutate } = useSWR('/api/payments/cash-accounts', fetchJson);
  const options = data.map((account) => ({ ...account, detail: formatAmount(account.balance) }));
  return { options, error, reload: mutate };
}

/** The status chip: new, draft, posted, or reversed. */
function paymentStatus(payment) {
  if (!payment) {
    return { label: 'جديد', color: 'default' };
  }
  if (payment.reversalEntryId) {
    return { label: `معكوس · قيد ${payment.reversalEntryId}`, color: 'error' };
  }
  if (payment.status === 'POSTED') {
    return { label: `مُرحَّل · قيد ${payment.journalEntryId}`, color: 'success' };
  }
  return { label: 'مسودة', color: 'warning' };
}

/** A link to a journal entry, opening it in a window. */
function EntryLink({ entryId, openLink }) {
  const target = linkTarget({ documentColumn: 'page', idColumn: 'id' }, { page: 'journal-entry', id: entryId });
  return <WindowLink target={target} openLink={openLink}>{`القيد ${entryId}`}</WindowLink>;
}

/** What became of a posted payment: its entry, the one reversing it, and who posted it. */
function PaymentOrigin({ payment, openLink }) {
  return <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    <Typography variant="body2">
      قيد السند: <EntryLink entryId={payment.journalEntryId} openLink={openLink} />
    </Typography>
    {payment.reversalEntryId && <Typography variant="body2" color="error">
      عُكس بـ<EntryLink entryId={payment.reversalEntryId} openLink={openLink} />
    </Typography>}
    {payment.postedBy && <Typography variant="body2" color="text.secondary">
      رحّله <bdi>{payment.postedBy}</bdi>
    </Typography>}
  </Stack>;
}

/** A field of the form beside its label, with its error under it. */
function PaymentField({ id, label, error, children }) {
  return <Box sx={{ minWidth: 0 }}>
    <Labelled id={id} label={label} basis={300}>{children}</Labelled>
    {error && <Typography variant="caption" color="error">{error}</Typography>}
  </Box>;
}

export default function PaymentForm({ formId, formTitle, paymentId }) {
  const openLink = useOpenLink();
  const cashAccounts = useCashAccounts();
  const accounts = useAccountOptions();
  const customers = useOptions('customers');
  const suppliers = useOptions('suppliers');
  const doc = useDocument({
    api: '/api/payments', documentId: paymentId, formId, formTitle, page: '/dashboard/payment',
    idParam: 'paymentId', emptyHeader: EMPTY_HEADER, headerFrom, headerBody,
  });
  const { document: payment, header, editable } = doc;
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

  const errors = checkPayment(header, subledgerOf(header.accountId));
  // A new payment starts empty: its errors wait for the first save
  const shownErrors = doc.isDraft || triedToSave ? errors : {};

  const cashAccount = cashAccounts.options.find((option) => option.value === header.cashAccountId);
  const overBalance = editable && isOverBalance(header.amount, cashAccount?.balance ?? null);
  const balanceWarning = overBalance
    ? `المبلغ أكبر من رصيد "${cashAccount.label}" (${formatAmount(cashAccount.balance)})؛ يمكنك الاستمرار إن كان ذلك صحيحاً`
    : null;

  /** Saves a draft unless a field is wrong: what the user sees then stays as typed, with its error under the field. */
  const saveIfComplete = (next = header) => {
    if (!hasErrors(checkPayment(next, subledgerOf(next.accountId)))) {
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

  const newPayment = () => {
    doc.openNew();
    setTriedToSave(false);
  };

  const deleteThisDraft = async () => {
    if (await doc.deleteDraft(`حذف مسودة سند الصرف رقم ${payment.id}؟`)) {
      newPayment();
    }
  };

  /** Posting and reversing change what the cash accounts hold. */
  const sendAndReloadBalances = async (path) => {
    await doc.sendToDraft(path, 'POST');
    await cashAccounts.reload();
  };

  const reverse = () => {
    const question = `عكس سند الصرف رقم ${payment.id}؟ يُرحَّل قيد يلغي أثره، ويسري الآن.`;
    if (window.confirm(question)) {
      sendAndReloadBalances('/reverse');
    }
  };

  return <DocumentWindow>
    <HeaderRow>
      <DocumentTitle title={payment ? `سند صرف رقم ${payment.id}` : 'سند صرف جديد'} status={paymentStatus(payment)} />
    </HeaderRow>

    {doc.isPosted && <PaymentOrigin payment={payment} openLink={openLink} />}

    <DocumentAlerts loadError={doc.loadError}
      optionsError={cashAccounts.error ?? accounts.error ?? customers.error ?? suppliers.error}
      errorMessage={doc.errorMessage} onCloseError={() => doc.setErrorMessage(null)} headerWarning={balanceWarning} />

    <Box onKeyDown={(event) => moveOnEnter(event, fieldRefs)} sx={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 1.5, flexShrink: 0,
    }}>
      <PaymentField id={`${formId}-cash`} label="يُصرف من" error={shownErrors.cashAccountId}>
        <Combobox {...COMBOBOX_PROPS} ref={cashRef} aria-labelledby={`${formId}-cash`} options={cashAccounts.options}
          value={header.cashAccountId} disabled={!editable} placeholder="اختر الخزينة أو البنك…"
          onChange={(cashAccountId) => choose({ cashAccountId })} />
      </PaymentField>
      <PaymentField id={`${formId}-account`} label="يُصرف إلى" error={shownErrors.accountId}>
        <Combobox {...COMBOBOX_PROPS} ref={accountRef} aria-labelledby={`${formId}-account`} options={accounts.options}
          value={header.accountId} disabled={!editable} placeholder="اختر الحساب…" onChange={changeAccount} />
      </PaymentField>
      <PaymentField id={`${formId}-party`} label={kind ? PARTY_LABELS[kind] : 'الطرف'} error={shownErrors.partyId}>
        <Combobox {...COMBOBOX_PROPS} ref={partyRef} aria-labelledby={`${formId}-party`} options={kind ? partyOptions : []}
          value={partyId} disabled={!editable || !kind} onChange={changeParty}
          placeholder={kind ? `اختر ${PARTY_LABELS[kind]}…` : 'لا طرف لهذا الحساب'} />
      </PaymentField>
      <PaymentField id={`${formId}-amount`} label="المبلغ" error={shownErrors.amount}>
        <TextField size="small" fullWidth value={header.amount} disabled={!editable} inputRef={amountRef}
          error={!!shownErrors.amount} onChange={(event) => doc.editHeader({ amount: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr', 'aria-labelledby': `${formId}-amount` } }} />
      </PaymentField>
      <PaymentField id={`${formId}-datetime`} label="تاريخ الصرف">
        <TextField size="small" type="datetime-local" fullWidth value={header.paymentDatetime} disabled={!editable}
          inputRef={datetimeRef} helperText={editable && !header.paymentDatetime ? 'فارغ: عند الترحيل' : undefined}
          onChange={(event) => doc.editHeader({ paymentDatetime: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { dir: 'ltr', 'aria-labelledby': `${formId}-datetime` } }} />
      </PaymentField>
      <PaymentField id={`${formId}-reference`} label="رقم المرجع" error={shownErrors.reference}>
        <TextField size="small" fullWidth value={header.reference} disabled={!editable} inputRef={referenceRef}
          placeholder="رقم الشيك أو التحويل" error={!!shownErrors.reference}
          onChange={(event) => doc.editHeader({ reference: event.target.value })} onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { dir: 'ltr', 'aria-labelledby': `${formId}-reference` } }} />
      </PaymentField>
      <PaymentField id={`${formId}-description`} label="البيان" error={shownErrors.description}>
        <TextField size="small" fullWidth value={header.description} disabled={!editable} inputRef={descriptionRef}
          error={!!shownErrors.description} onChange={(event) => doc.editHeader({ description: event.target.value })}
          onBlur={() => saveIfComplete()}
          slotProps={{ htmlInput: { 'aria-labelledby': `${formId}-description` } }} />
      </PaymentField>
    </Box>

    <Box sx={{ flex: 1 }} />

    <DocumentActions isNew={doc.isNew} isDraft={doc.isDraft} pending={doc.pending}
      newStep={{ onClick: saveNew, label: 'حفظ', icon: <SaveIcon /> }} newStepRef={saveRef}
      nextStep={{ onClick: () => sendAndReloadBalances('/post'), disabled: hasErrors(errors) }}
      onDeleteDraft={deleteThisDraft} onNew={newPayment}>
      {payment?.canBeReversed && <Button color="error" startIcon={<UndoIcon />} disabled={doc.pending > 0}
        onClick={reverse}>عكس السند</Button>}
    </DocumentActions>
  </DocumentWindow>;
}
