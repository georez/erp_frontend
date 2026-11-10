import SalesInvoicePrint from './SalesInvoicePrint';
import SalesReturnPrint from './SalesReturnPrint';
import PurchaseInvoicePrint from './PurchaseInvoicePrint';
import PurchaseReturnPrint from './PurchaseReturnPrint';
import StockAdjustmentPrint from './StockAdjustmentPrint';
import OpeningBalancePrint from './OpeningBalancePrint';
import JournalEntryPrint from './JournalEntryPrint';
import { PaymentPrint, ReceiptPrint } from './CashDocumentPrint';

/**
 * The printouts, by the name in their address (/print/<document>/<id>), each given the document's id. A form's print
 * button opens its document's (DocumentActions' onPrint).
 */
export const PRINT_PAGES = Object.freeze({
  'sales-invoice': SalesInvoicePrint,
  'sales-return': SalesReturnPrint,
  'purchase-invoice': PurchaseInvoicePrint,
  'purchase-return': PurchaseReturnPrint,
  'stock-adjustment': StockAdjustmentPrint,
  'opening-balance': OpeningBalancePrint,
  'journal-entry': JournalEntryPrint,
  payment: PaymentPrint,
  receipt: ReceiptPrint,
});

/** Opens the document's printout in a new tab. */
export function openPrintout(document, id) {
  window.open(`/print/${document}/${id}`, '_blank');
}
