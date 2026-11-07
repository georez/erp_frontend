'use client';

import { CashDocumentForm } from './CashDocumentForm';

/*
 * The payment document (سند صرف): money paid out of a cash box or bank account to any other account. Posting credits
 * the cash account and debits the other one. Paying more than the account holds is warned about, not refused: a bank
 * may allow an overdraft the books don't know.
 */
const PAYMENT = {
  api: '/api/payments',
  page: '/dashboard/payment',
  idParam: 'paymentId',
  name: 'سند صرف',
  theName: 'سند الصرف',
  cashLabel: 'يُصرف من',
  accountLabel: 'يُصرف إلى',
  dateLabel: 'تاريخ الصرف',
  warnsOverBalance: true,
};

export default function PaymentForm({ formId, formTitle, paymentId }) {
  return <CashDocumentForm kind={PAYMENT} formId={formId} formTitle={formTitle} documentId={paymentId} />;
}
