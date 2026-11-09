'use client';

import { CashDocumentForm } from './CashDocumentForm';

/*
 * The receipt document (سند قبض): money received into a cash box or bank account from any other account. Posting debits
 * the cash account and credits the other one.
 */
const RECEIPT = {
  api: '/api/receipts',
  page: '/dashboard/receipt',
  printout: 'receipt',
  idParam: 'receiptId',
  name: 'سند قبض',
  theName: 'سند القبض',
  cashLabel: 'يُقبض في',
  accountLabel: 'يُقبض من',
  dateLabel: 'تاريخ القبض',
  warnsOverBalance: false,
};

export default function ReceiptForm({ formId, formTitle, receiptId }) {
  return <CashDocumentForm kind={RECEIPT} formId={formId} formTitle={formTitle} documentId={receiptId} />;
}
