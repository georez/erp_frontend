import SchemaCrud from '@/components/forms/SchemaCrud';
import Report from '@/components/reports/Report';
import TrialBalance from '@/components/reports/trialBalance/TrialBalance';
import ChartOfAccounts from '@/components/reports/chartOfAccounts/ChartOfAccounts';
import StatementPage from '@/components/reports/statement/StatementPage';
import SupplierBalances from '@/components/reports/supplierBalances/SupplierBalances';
import StockAdjustmentForm from '@/components/forms/StockAdjustmentForm';
import OpeningBalanceForm from '@/components/forms/OpeningBalanceForm';
import PurchaseInvoiceForm from '@/components/forms/PurchaseInvoiceForm';
import PurchaseReturnForm from '@/components/forms/PurchaseReturnForm';
import JournalEntryForm from '@/components/forms/JournalEntryForm';
import PaymentForm from '@/components/forms/PaymentForm';
import ReceiptForm from '@/components/forms/ReceiptForm';
import SalesInvoiceForm from '@/components/forms/SalesInvoiceForm';
import SalesReturnForm from '@/components/forms/SalesReturnForm';
import StockTransferForm from '@/components/forms/StockTransferForm';
import SettingsForm from '@/components/forms/SettingsForm';

// Each dashboard URL renders a fixed component. The entries return elements (rather than being the
// components themselves) so callers never render a component chosen at render time.
const urlToComponentMap = {
  '/dashboard/form': (props) => <SchemaCrud {...props} />,
  '/dashboard/report': (props) => <Report {...props} />,
  '/dashboard/trial-balance': (props) => <TrialBalance {...props} />,
  '/dashboard/chart-of-accounts': (props) => <ChartOfAccounts {...props} />,
  '/dashboard/account-statement': (props) => <StatementPage kind="account" {...props} />,
  '/dashboard/supplier-statement': (props) => <StatementPage kind="supplier" {...props} />,
  '/dashboard/customer-statement': (props) => <StatementPage kind="customer" {...props} />,
  '/dashboard/journal-entry': (props) => <JournalEntryForm {...props} />,
  '/dashboard/payment': (props) => <PaymentForm {...props} />,
  '/dashboard/receipt': (props) => <ReceiptForm {...props} />,
  '/dashboard/supplier-balances': (props) => <SupplierBalances {...props} />,
  '/dashboard/stock-adjustment': (props) => <StockAdjustmentForm {...props} />,
  '/dashboard/opening-balance': (props) => <OpeningBalanceForm {...props} />,
  '/dashboard/purchase-invoice': (props) => <PurchaseInvoiceForm {...props} />,
  '/dashboard/purchase-return': (props) => <PurchaseReturnForm {...props} />,
  '/dashboard/sales-invoice': (props) => <SalesInvoiceForm {...props} />,
  '/dashboard/sales-return': (props) => <SalesReturnForm {...props} />,
  '/dashboard/stock-transfer': (props) => <StockTransferForm {...props} />,
  '/dashboard/settings': (props) => <SettingsForm {...props} />,
};

function pathOf(url) {
  return url.split('?')[0];
}

export function hasComponentForUrl(url) {
  return Object.hasOwn(urlToComponentMap, pathOf(url));
}

/** Renders the component for a dashboard URL, or null when the URL is unknown. */
export default function renderComponentForUrl(url, props) {
  const render = urlToComponentMap[pathOf(url)];
  return render ? render(props) : null;
}
