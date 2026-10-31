/*
 * The dashboard menu's links (DrawerForm), in the order they're shown. Each opens a window: a table's generic form, a
 * report, or a document's page, with the link's text as the window's title.
 */

/** A table's generic form (SchemaCrud), e.g. "customers". */
const formLink = (text, schemaName) => ({
  text, url: `/dashboard/form?schemaName=${schemaName}&formTitle=${encodeURIComponent(text)}`,
});

/** A report (backend resources/reports/{reportName}). */
const reportLink = (text, reportName) => ({
  text, url: `/dashboard/report?reportName=${reportName}&formTitle=${encodeURIComponent(text)}`,
});

/** A document's page, e.g. "purchase-invoice" (urlToComponentMap). */
const documentLink = (text, page) => ({
  text, url: `/dashboard/${page}?formTitle=${encodeURIComponent(text)}`,
});

export const MENU_LINKS = [
  formLink('ادخال الحسابات', 'accounts'),

  // --- customers ---
  formLink('ادخال العملاء', 'customers'),
  formLink('ادخال تصنيف العملاء', 'customer_categories'),
  reportLink('تقرير تصنيف العملاء', 'customerCategoriesReport'),
  reportLink('تقرير العملاء', 'customersReport'),

  // --- suppliers ---
  formLink('ادخال الموردين', 'suppliers'),
  formLink('ادخال تصنيف الموردين', 'supplier_categories'),
  reportLink('تقرير تصنيف الموردين', 'supplierCategoriesReport'),
  reportLink('تقرير الموردين', 'suppliersReport'),

  // --- products and warehouses ---
  formLink('ادخال الأصناف', 'products'),
  reportLink('تقرير الأصناف', 'productsReport'),
  formLink('ادخال تصنيف الأصناف', 'product_categories'),
  formLink('ادخال المخازن', 'warehouses'),

  // --- purchases ---
  documentLink('فاتورة مشتريات', 'purchase-invoice'),
  reportLink('تقرير فواتير المشتريات', 'purchaseInvoicesReport'),
  documentLink('مرتجع مشتريات', 'purchase-return'),
  reportLink('تقرير مرتجعات المشتريات', 'purchaseReturnsReport'),

  // --- stock ---
  documentLink('رصيد افتتاحي للمخزون', 'opening-balance'),
  reportLink('تقرير الأرصدة الافتتاحية', 'openingBalancesReport'),
  documentLink('تسوية مخزون', 'stock-adjustment'),
  reportLink('تقرير أرصدة المخزون', 'stockBalancesReport'),
  reportLink('تقرير تسويات المخزون', 'stockAdjustmentsReport'),
  reportLink('تقرير التشغيلات والصلاحية', 'stockBatchesReport'),
  reportLink('تقرير حركات المخزون', 'stockMovementsReport'),
];
