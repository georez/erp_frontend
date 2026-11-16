/*
 * The dashboard menu's links (DrawerForm), grouped into modules, in the order they're shown. Each opens a window: a
 * table's generic form, a report, or a document's page, with the link's text as the window's title. Each names the
 * permissions that open it (backend permissions.json): the menu shows it to a user with any of them.
 */

/** The permission to open a report (backend resources/reports/{reportName}). */
const reportPermission = (reportName) => `GET /api/report/${reportName}/metadata`;

/** A table's generic form (SchemaCrud), e.g. "customers". */
const formLink = (text, schemaName) => ({
  text, url: `/dashboard/form?schemaName=${schemaName}&formTitle=${encodeURIComponent(text)}`,
  permissions: [`GET /api/schemacrud/${schemaName}`],
});

/** A report shown in the generic report screen. */
const reportLink = (text, reportName) => ({
  text, url: `/dashboard/report?reportName=${reportName}&formTitle=${encodeURIComponent(text)}`,
  permissions: [reportPermission(reportName)],
});

/** A page of its own (urlToComponentMap), e.g. "settings", opened by the permissions. */
const pageLink = (text, page, permissions) => ({
  text, url: `/dashboard/${page}?formTitle=${encodeURIComponent(text)}`, permissions,
});

/** A report with a page of its own, e.g. "trial-balance". */
const reportPageLink = (text, page, reportName) => pageLink(text, page, [reportPermission(reportName)]);

/** A document's page, e.g. "purchase-invoice": for a user who may open a document, or start one. */
const documentLink = (text, page, api) => pageLink(text, page, [`GET ${api}/{id}`, `POST ${api}`]);

export const MENU_MODULES = [
  {
    title: 'الحسابات',
    links: [
      formLink('ادخال الحسابات', 'accounts'),
      reportLink('تقرير الحسابات', 'accountsReport'),
      documentLink('قيد يومية', 'journal-entry', '/api/journal-entries'),
      documentLink('سند صرف', 'payment', '/api/payments'),
      reportLink('تقرير سندات الصرف', 'paymentsReport'),
      documentLink('سند قبض', 'receipt', '/api/receipts'),
      reportLink('تقرير سندات القبض', 'receiptsReport'),
      reportLink('دفتر اليومية', 'generalJournalReport'),
      reportLink('تقرير القيود', 'journalEntriesReport'),
      reportPageLink('دليل الحسابات', 'chart-of-accounts', 'chartOfAccountsReport'),
      reportPageLink('ميزان المراجعة', 'trial-balance', 'trialBalanceReport'),
      reportPageLink('قائمة الدخل', 'income-statement', 'incomeStatementReport'),
      reportPageLink('الميزانية', 'balance-sheet', 'balanceSheetReport'),
      pageLink('إقفال السنة', 'year-closing', ['GET /api/year-closings']),
      reportPageLink('كشف حساب', 'account-statement', 'accountStatementReport'),
    ],
  },
  {
    title: 'العملاء',
    links: [
      formLink('ادخال العملاء', 'customers'),
      formLink('ادخال تصنيف العملاء', 'customer_categories'),
      reportLink('تقرير تصنيف العملاء', 'customerCategoriesReport'),
      formLink('ادخال شرائح العملاء', 'customer_tiers'),
      reportLink('تقرير شرائح العملاء', 'customerTiersReport'),
      reportLink('تقرير العملاء', 'customersReport'),
      reportPageLink('كشف حساب عميل', 'customer-statement', 'customerStatementReport'),
      reportPageLink('أرصدة العملاء', 'customer-balances', 'customerBalancesReport'),
    ],
  },
  {
    title: 'الموردين',
    links: [
      formLink('ادخال الموردين', 'suppliers'),
      formLink('ادخال تصنيف الموردين', 'supplier_categories'),
      reportLink('تقرير تصنيف الموردين', 'supplierCategoriesReport'),
      reportLink('تقرير الموردين', 'suppliersReport'),
      reportPageLink('كشف حساب مورد', 'supplier-statement', 'supplierStatementReport'),
      reportPageLink('أرصدة الموردين', 'supplier-balances', 'supplierBalancesReport'),
    ],
  },
  {
    title: 'الأصناف والمخازن',
    links: [
      formLink('ادخال الأصناف', 'products'),
      reportLink('تقرير الأصناف', 'productsReport'),
      formLink('ادخال تصنيف الأصناف', 'product_categories'),
      reportLink('تقرير تصنيف الأصناف', 'productCategoriesReport'),
      formLink('ادخال المخازن', 'warehouses'),
      reportLink('تقرير المخازن', 'warehousesReport'),
      formLink('ادخال خصومات الشرائح', 'warehouse_tier_discounts'),
      reportLink('تقرير خصومات الشرائح', 'warehouseTierDiscountsReport'),
    ],
  },
  {
    title: 'المشتريات',
    links: [
      documentLink('فاتورة مشتريات', 'purchase-invoice', '/api/purchase-invoices'),
      reportLink('تقرير فواتير المشتريات', 'purchaseInvoicesReport'),
      documentLink('مرتجع مشتريات', 'purchase-return', '/api/purchase-returns'),
      reportLink('تقرير مرتجعات المشتريات', 'purchaseReturnsReport'),
    ],
  },
  {
    title: 'المبيعات',
    links: [
      documentLink('فاتورة مبيعات', 'sales-invoice', '/api/sales-invoices'),
      reportLink('تقرير فواتير المبيعات', 'salesInvoicesReport'),
      reportLink('تقرير الكميات المحجوزة', 'salesReservationsReport'),
      documentLink('مرتجع مبيعات', 'sales-return', '/api/sales-returns'),
      reportLink('تقرير مرتجعات المبيعات', 'salesReturnsReport'),
      reportLink('ربحية فواتير المبيعات بعد مرتجعاتها', 'salesInvoiceProfitReport'),
    ],
  },
  {
    title: 'المخزون',
    links: [
      documentLink('رصيد افتتاحي للمخزون', 'opening-balance', '/api/opening-balances'),
      reportLink('تقرير الأرصدة الافتتاحية', 'openingBalancesReport'),
      documentLink('تسوية مخزون', 'stock-adjustment', '/api/stock-adjustments'),
      documentLink('تحويل مخزني', 'stock-transfer', '/api/stock-transfers'),
      reportLink('تقرير أرصدة المخزون', 'stockBalancesReport'),
      reportLink('المخزون في لحظة', 'stockAsOfReport'),
      reportPageLink('حركة صنف', 'product-movements', 'productMovementsReport'),
      reportLink('تقرير تسويات المخزون', 'stockAdjustmentsReport'),
      reportLink('تقرير التحويلات المخزنية', 'stockTransfersReport'),
      reportLink('تقرير التشغيلات والصلاحية', 'stockBatchesReport'),
      reportLink('تقرير حركات المخزون', 'stockMovementsReport'),
    ],
  },
  {
    title: 'الإعدادات',
    links: [
      pageLink('الإعدادات', 'settings', ['GET /api/settings']),
      pageLink('المستخدمون', 'users', ['GET /api/users']),
      pageLink('الأدوار', 'roles', ['GET /api/roles']),
      reportLink('سجل الدخول', 'loginEventsReport'),
    ],
  },
];

/** The modules and links the user may open (usePermissions' has); a module with none is left out. */
export function permittedModules(has) {
  return MENU_MODULES
    .map((module) => ({ ...module, links: module.links.filter((link) => link.permissions.some(has)) }))
    .filter((module) => module.links.length > 0);
}
