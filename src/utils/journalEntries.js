import { Big } from 'bigdecimal.js';
import { normalizeDecimalText, parseDecimal } from './decimals.js';

/*
 * The journal entry form's rules (components/forms/JournalEntryForm.jsx): a line's amounts as typed, the party its
 * account needs, and what a line or an entry opens (a statement, a document).
 */

// journal_entry_lines.debit and credit are numeric(25, 7)
const MAX_DECIMALS = 7;
const MAX_INTEGER_DIGITS = 18;

const isBlank = (text) => normalizeDecimalText(text) === '';

/** One amount as typed: { amount } (decimal text, "0" when empty) or { error }. */
function checkAmount(text) {
  if (isBlank(text)) {
    return { amount: '0' };
  }
  const value = parseDecimal(text);
  if (!value || value.signum() < 0) {
    return { error: 'رقم موجب' };
  }
  const stripped = value.stripTrailingZeros();
  if (Math.max(stripped.scale(), 0) > MAX_DECIMALS) {
    return { error: `حتى ${MAX_DECIMALS} أرقام عشرية` };
  }
  if (stripped.precision() - stripped.scale() > MAX_INTEGER_DIGITS) {
    return { error: 'المبلغ أكبر من المسموح' };
  }
  return { amount: normalizeDecimalText(text) };
}

/**
 * A line's debit and credit as typed: the amounts to send ({ debit, credit }, decimal text, an empty one "0"), or
 * the errors to show under the fields ({ errors: { debit?, credit? } }). Exactly one of them is more than zero.
 */
export function checkLineAmounts(debitText, creditText) {
  const debit = checkAmount(debitText);
  const credit = checkAmount(creditText);
  if (debit.error || credit.error) {
    return { errors: { debit: debit.error, credit: credit.error } };
  }
  const hasDebit = Big(debit.amount).signum() > 0;
  const hasCredit = Big(credit.amount).signum() > 0;
  if (hasDebit && hasCredit) {
    return { errors: { credit: 'المبلغ في جانب واحد فقط' } };
  }
  if (!hasDebit && !hasCredit) {
    return { errors: { debit: 'أدخل المبلغ مديناً أو دائناً' } };
  }
  return { debit: debit.amount, credit: credit.amount };
}

/** The party a line on an account with this subledger needs: 'customer', 'supplier', or null for none. */
export function partyKind(subledger) {
  if (subledger === 'CUSTOMER') {
    return 'customer';
  }
  if (subledger === 'SUPPLIER') {
    return 'supplier';
  }
  return null;
}

// A document's type (journal_entries.source_type) → its page (reportutils' DOCUMENT_PAGES)
const DOCUMENT_PAGE_OF_TYPE = Object.freeze({
  stock_adjustment: 'stock-adjustment',
  opening_balance: 'opening-balance',
  purchase_invoice: 'purchase-invoice',
  purchase_return: 'purchase-return',
  payment: 'payment',
  receipt: 'receipt',
  sales_invoice: 'sales-invoice',
  sales_return: 'sales-return',
  stock_transfer: 'stock-transfer',
});

/** The page that opens an entry's document, or null (a manual entry, or a document with no page). */
export function documentPageOf(sourceType) {
  return Object.hasOwn(DOCUMENT_PAGE_OF_TYPE, sourceType ?? '') ? DOCUMENT_PAGE_OF_TYPE[sourceType] : null;
}

const twoDigits = (number) => String(number).padStart(2, '0');
const isoDate = (date) => `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

/**
 * The period a line's statement opens with: from the first of the entry's month to the day it takes effect, so the
 * line is the period's last; a draft without a date-time takes effect when it's posted, so this month up to today.
 *
 * @param {string|null} entryDatetime  "2026-10-31T23:59:00", or null
 * @param {Date} today
 * @returns {{p_from_date: string, p_to_date: string}}
 */
export function statementPeriod(entryDatetime, today) {
  const toDate = entryDatetime ? entryDatetime.slice(0, 10) : isoDate(today);
  return { p_from_date: `${toDate.slice(0, 8)}01`, p_to_date: toDate };
}
