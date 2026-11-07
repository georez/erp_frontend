import { Big } from 'bigdecimal.js';
import { normalizeDecimalText, parseDecimal } from './decimals.js';
import { partyKind } from './journalEntries.js';

/*
 * The payment form's rules (components/forms/PaymentForm.jsx), checked before a payment is sent to the backend (which
 * checks them again).
 */

// payments.amount is numeric(20, 2), in piasters; reference and description are varchar(100) and varchar(500)
const MAX_DECIMALS = 2;
const MAX_INTEGER_DIGITS = 18;
const MAX_REFERENCE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

const MISSING_PARTY = { customer: 'حدّد العميل', supplier: 'حدّد المورد' };

/** The amount as typed: { amount } (decimal text) or { error }. */
export function checkPaymentAmount(text) {
  const normalized = normalizeDecimalText(text);
  if (normalized === '') {
    return { error: 'مطلوب' };
  }
  const value = parseDecimal(text);
  if (!value || value.signum() <= 0) {
    return { error: 'رقم أكبر من صفر' };
  }
  const stripped = value.stripTrailingZeros();
  if (Math.max(stripped.scale(), 0) > MAX_DECIMALS) {
    return { error: `حتى ${MAX_DECIMALS} رقمين عشريين` };
  }
  if (stripped.precision() - stripped.scale() > MAX_INTEGER_DIGITS) {
    return { error: 'المبلغ أكبر من المسموح' };
  }
  return { amount: normalized };
}

/**
 * The payment's errors by field (a field without one is left out).
 *
 * @param payment   the form's fields: { cashAccountId, accountId, customerId, supplierId, amount, reference, description }
 * @param subledger the subledger of the account paid to, or null
 */
export function checkPayment(payment, subledger) {
  const errors = {};
  if (payment.cashAccountId == null) {
    errors.cashAccountId = 'حدّد الخزينة أو البنك';
  }
  if (payment.accountId == null) {
    errors.accountId = 'حدّد الحساب';
  } else if (payment.accountId === payment.cashAccountId) {
    errors.accountId = 'لا يمكن الصرف إلى نفس الحساب';
  }

  const kind = partyKind(subledger);
  const partyId = kind === 'customer' ? payment.customerId : payment.supplierId;
  if (kind && partyId == null) {
    errors.partyId = MISSING_PARTY[kind];
  }

  const amount = checkPaymentAmount(payment.amount);
  if (amount.error) {
    errors.amount = amount.error;
  }
  if (payment.reference.trim().length > MAX_REFERENCE_LENGTH) {
    errors.reference = `الحد الأقصى ${MAX_REFERENCE_LENGTH} حرف`;
  }
  if (payment.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `الحد الأقصى ${MAX_DESCRIPTION_LENGTH} حرف`;
  }
  return errors;
}

/**
 * Whether the amount typed is more than the cash account has. Only a warning: a bank may allow an overdraft the books
 * don't know, so the payment isn't refused. False while the amount can't be read or the balance isn't known.
 *
 * @param amountText the amount as typed
 * @param balance    the account's balance (decimal text), or null
 */
export function isOverBalance(amountText, balance) {
  const { amount } = checkPaymentAmount(amountText);
  if (amount == null || balance == null) {
    return false;
  }
  return Big(amount).compareTo(Big(balance)) > 0;
}
