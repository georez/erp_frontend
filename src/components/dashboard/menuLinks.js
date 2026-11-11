/*
 * The dashboard menu's links (DrawerForm), grouped into modules, in the order they're shown. Each opens a window: a
 * table's generic form, a report, or a document's page, with the link's text as the window's title.
 */

/** A table's generic form (SchemaCrud), e.g. "customers". */
const formLink = (text, schemaName) => ({
  text, url: `/dashboard/form?schemaName=${schemaName}&formTitle=${encodeURIComponent(text)}`,
});

/** A report (backend resources/reports/{reportName}). */
const reportLink = (text, reportName) => ({
  text, url: `/dashboard/report?reportName=${reportName}&formTitle=${encodeURIComponent(text)}`,
});

/** A document's page, e.g. "purchase-invoice", or a report with a page of its own (urlToComponentMap). */
const pageLink = (text, page) => ({
  text, url: `/dashboard/${page}?formTitle=${encodeURIComponent(text)}`,
});
const documentLink = pageLink;

export const MENU_MODULES = [
  {
    title: 'الحسابات',
    links: [
      formLink('ادخال الحسابات', 'accounts'),
      reportLink('تقرير الحسابات', 'accountsReport'),
      documentLink('قيد يومية', 'journal-entry'),
      documentLink('سند صرف', 'payment'),
      reportLink('تقرير سندات الصرف', 'paymentsReport'),
      documentLink('سند قبض', 'receipt'),
      reportLink('تقرير سندات القبض', 'receiptsReport'),
      reportLink('دفتر اليومية', 'generalJournalReport'),
      reportLink('تقرير القيود', 'journalEntriesReport'),
      pageLink('دليل الحسابات', 'chart-of-accounts'),
      pageLink('ميزان المراجعة', 'trial-balance'),
      pageLink('قائمة الدخل', 'income-statement'),
      pageLink('الميزانية', 'balance-sheet'),
      pageLink('كشف حساب', 'account-statement'),
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
      pageLink('كشف حساب عميل', 'customer-statement'),
      pageLink('أرصدة العملاء', 'customer-balances'),
    ],
  },
  {
    title: 'الموردين',
    links: [
      formLink('ادخال الموردين', 'suppliers'),
      formLink('ادخال تصنيف الموردين', 'supplier_categories'),
      reportLink('تقرير تصنيف الموردين', 'supplierCategoriesReport'),
      reportLink('تقرير الموردين', 'suppliersReport'),
      pageLink('كشف حساب مورد', 'supplier-statement'),
      pageLink('أرصدة الموردين', 'supplier-balances'),
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
      documentLink('فاتورة مشتريات', 'purchase-invoice'),
      reportLink('تقرير فواتير المشتريات', 'purchaseInvoicesReport'),
      documentLink('مرتجع مشتريات', 'purchase-return'),
      reportLink('تقرير مرتجعات المشتريات', 'purchaseReturnsReport'),
    ],
  },
  {
    title: 'المبيعات',
    links: [
      documentLink('فاتورة مبيعات', 'sales-invoice'),
      reportLink('تقرير فواتير المبيعات', 'salesInvoicesReport'),
      reportLink('تقرير الكميات المحجوزة', 'salesReservationsReport'),
      documentLink('مرتجع مبيعات', 'sales-return'),
      reportLink('تقرير مرتجعات المبيعات', 'salesReturnsReport'),
      reportLink('ربحية فواتير المبيعات بعد مرتجعاتها', 'salesInvoiceProfitReport'),
    ],
  },
  {
    title: 'المخزون',
    links: [
      documentLink('رصيد افتتاحي للمخزون', 'opening-balance'),
      reportLink('تقرير الأرصدة الافتتاحية', 'openingBalancesReport'),
      documentLink('تسوية مخزون', 'stock-adjustment'),
      documentLink('تحويل مخزني', 'stock-transfer'),
      reportLink('تقرير أرصدة المخزون', 'stockBalancesReport'),
      reportLink('تقرير تسويات المخزون', 'stockAdjustmentsReport'),
      reportLink('تقرير التحويلات المخزنية', 'stockTransfersReport'),
      reportLink('تقرير التشغيلات والصلاحية', 'stockBatchesReport'),
      reportLink('تقرير حركات المخزون', 'stockMovementsReport'),
    ],
  },
  {
    title: 'الإعدادات',
    links: [
      pageLink('الإعدادات', 'settings'),
    ],
  },
];
