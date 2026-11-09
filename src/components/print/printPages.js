import SalesInvoicePrint from './SalesInvoicePrint';
import SalesReturnPrint from './SalesReturnPrint';
import { PaymentPrint, ReceiptPrint } from './CashDocumentPrint';

/**
 * The printouts, by the name in their address (/print/<document>/<id>), each given the document's id. A form's print
 * button opens its document's (DocumentActions' onPrint).
 */
export const PRINT_PAGES = Object.freeze({
  'sales-invoice': SalesInvoicePrint,
  'sales-return': SalesReturnPrint,
  payment: PaymentPrint,
  receipt: ReceiptPrint,
});

/** Opens the document's printout in a new tab. */
export function openPrintout(document, id) {
  window.open(`/print/${document}/${id}`, '_blank');
}
