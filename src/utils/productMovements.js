import { Big, RoundingMode } from 'bigdecimal.js';

/*
 * The product movement page's rows (productMovementsReport): the opening balance row, then the period's rows, each a
 * document's movement in one warehouse (or one batch of it). This module splits them into the page's tabs and adds
 * them up for its summary.
 */

/**
 * The operations on a product, in the order the summary lists them: what comes in, then what goes out. The names are
 * the report's (its operation column).
 */
export const OPERATIONS = Object.freeze([
  { name: 'رصيد افتتاحي', direction: 'in' },
  { name: 'مشتريات', direction: 'in' },
  { name: 'مرتجع مبيعات', direction: 'in' },
  { name: 'تحويل وارد', direction: 'in' },
  { name: 'تسوية بالزيادة', direction: 'in' },
  { name: 'مبيعات', direction: 'out' },
  { name: 'مرتجع مشتريات', direction: 'out' },
  { name: 'تحويل صادر', direction: 'out' },
  { name: 'تسوية بالعجز', direction: 'out' },
]);

// Where a tab puts the batch columns, when the rows are by batch
const BATCH = 'batch';

/**
 * The page's tabs of rows: all of them in order, then one per kind of document (the report's document_type). Each
 * lists its columns, in order: a field, or [field, header] where the tab names it its own way; BATCH is the batch
 * number and expiry, by batch only. `totals` are the fields its total row adds up.
 */
export const MOVEMENT_TABS = Object.freeze([
  {
    key: 'all', label: 'كل الحركات', documentTypes: null,
    columns: ['entry_datetime', 'document_id', 'operation', 'warehouse_name', BATCH, 'party_name', 'quantity_in',
      'quantity_out', 'value', 'cost_discount_percent', 'balance_after', 'warehouse_balance_after', 'description'],
    totals: ['quantity_in', 'quantity_out'],
  },
  {
    key: 'purchases', label: 'المشتريات', documentTypes: ['purchase_invoice'],
    columns: ['entry_datetime', 'document_id', 'warehouse_name', BATCH, ['party_name', 'المورد'],
      'supplier_invoice_number', 'quantity', 'discount_percent', 'unit_price', 'net_amount', 'vat_amount',
      'description'],
    totals: ['quantity', 'net_amount', 'vat_amount'],
  },
  {
    key: 'purchase-returns', label: 'مرتجعات المشتريات', documentTypes: ['purchase_return'],
    columns: ['entry_datetime', 'document_id', 'warehouse_name', BATCH, ['party_name', 'المورد'],
      'against_invoice_id', 'quantity', 'discount_percent', 'unit_price', 'net_amount', 'vat_amount', 'value',
      'cost_discount_percent', 'description'],
    totals: ['quantity', 'net_amount', 'vat_amount', 'value'],
  },
  {
    key: 'sales', label: 'المبيعات', documentTypes: ['sales_invoice'],
    columns: ['entry_datetime', 'document_id', 'warehouse_name', BATCH, ['party_name', 'العميل'], 'quantity',
      ['discount_percent', 'خصم البيع %'], 'unit_price', 'net_amount', 'vat_amount', 'value', 'cost_discount_percent',
      'profit', 'description'],
    totals: ['quantity', 'net_amount', 'vat_amount', 'value', 'profit'],
  },
  {
    key: 'sales-returns', label: 'مرتجعات المبيعات', documentTypes: ['sales_return'],
    columns: ['entry_datetime', 'document_id', 'warehouse_name', BATCH, ['party_name', 'العميل'],
      'against_invoice_id', 'quantity', ['discount_percent', 'خصم البيع %'], 'unit_price', 'net_amount',
      'vat_amount', 'value', 'cost_discount_percent', 'description'],
    totals: ['quantity', 'net_amount', 'vat_amount', 'value'],
  },
  {
    key: 'transfers', label: 'التحويلات', documentTypes: ['stock_transfer'],
    columns: ['entry_datetime', 'document_id', 'operation', 'warehouse_name', 'other_warehouse_name', BATCH,
      'quantity_in', 'quantity_out', 'value', 'cost_discount_percent', 'description'],
    totals: ['quantity_in', 'quantity_out'],
  },
  {
    key: 'adjustments', label: 'التسويات', documentTypes: ['stock_adjustment'],
    columns: ['entry_datetime', 'document_id', 'operation', 'warehouse_name', BATCH, 'book_quantity',
      'counted_quantity', 'quantity_in', 'quantity_out', 'value', 'cost_discount_percent', 'description'],
    totals: ['quantity_in', 'quantity_out'],
  },
  {
    key: 'opening-balances', label: 'الأرصدة الافتتاحية', documentTypes: ['opening_balance'],
    columns: ['entry_datetime', 'document_id', 'warehouse_name', BATCH, 'quantity', 'cost_discount_percent',
      'unit_cost', 'value', 'description'],
    totals: ['quantity', 'value'],
  },
]);

// The report's detail (p_detail) and, by serials, its view (p_serials_view): the choices' texts, as report.json has them
export const BY_BATCH = 'حسب التشغيلة';
export const BY_SERIAL = 'حسب التشغيلة والسيريالات';
export const SERIALS_TABLE = 'صفوف التشغيلات وجدول السيريالات';

/**
 * What the rows were run with: by batch (by serials too), with serials, and whether the movements are split into a row
 * per serial (the default view by serials) or keep their batch rows with a serials table of their own.
 */
export function detailOf(runParams) {
  const withSerials = runParams.p_detail === BY_SERIAL;
  const serialsTable = withSerials && runParams.p_serials_view === SERIALS_TABLE;
  return {
    byBatch: runParams.p_detail === BY_BATCH || withSerials,
    withSerials,
    splitBySerial: withSerials && !serialsTable,
    serialsTable,
  };
}

/** Whether the row is the balance before the period (row_order 0), not a movement. */
export const isOpeningRow = (row) => Number(row.row_order) === 0;

/** The tab's rows: the period's movements of its kinds of document (all of them for the first tab). */
export function tabRows(rows, tab) {
  return rows.filter((row) => !isOpeningRow(row)
    && (tab.documentTypes === null || tab.documentTypes.includes(row.document_type)));
}

/**
 * The tab's columns as {field, header}: header is the tab's own name for it, or undefined for the report's label.
 * The batch columns only by batch; the serial too when the rows are one per serial.
 */
export function tabColumns(tab, byBatch, bySerial = false) {
  return tab.columns.flatMap((column) => {
    if (column === BATCH) {
      if (!byBatch) {
        return [];
      }
      const batch = [{ field: 'batch_number' }, { field: 'expiry_date' }];
      return bySerial ? [...batch, { field: 'serial_number' }] : batch;
    }
    const [field, header] = Array.isArray(column) ? column : [column, undefined];
    return [{ field, header }];
  });
}

const sum = (rows, field) => rows.reduce((total, row) => {
  const value = row[field];
  return value === null || value === undefined || value === '' ? total : total.add(Big(String(value)));
}, Big(0));

const plain = (number) => number.stripTrailingZeros().toPlainString();

/**
 * What an amount for a quantity is as a discount off the public price: 100 − 100 × amount ÷ (quantity × price), to 3
 * decimals as the forms show discounts. Null without an amount, a quantity or a price.
 *
 * @param {Big|null} amount
 * @param {Big} quantity
 * @param {string|null} publicPrice  decimal text
 * @returns {string|null}
 */
export function discountOff(amount, quantity, publicPrice) {
  if (amount === null || quantity.signum() === 0 || publicPrice === null || Big(publicPrice).signum() <= 0) {
    return null;
  }
  const atPublicPrice = quantity.multiply(Big(publicPrice));
  const paidPercent = amount.multiply(Big(100)).divide(atPublicPrice, 3, RoundingMode.HALF_UP);
  return plain(Big(100).subtract(paidPercent));
}

/**
 * The summary tab: the balance before the period, each operation's documents, quantity and value at cost in it, what
 * came in and went out altogether, and the balance at its end. An operation with prices (a sale, a purchase, their
 * returns) also has its average discount off the public price; every operation has its cost as a discount.
 *
 * @param {Array<object>} rows  the report's rows
 * @returns {{publicPrice: string|null, opening: {quantity: string, value: string},
 *   operations: Array<{name: string, direction: 'in'|'out', documents: number, quantity: string, value: string,
 *     discountPercent: string|null, costDiscountPercent: string|null}>,
 *   totalIn: {quantity: string, value: string}, totalOut: {quantity: string, value: string},
 *   closing: {quantity: string, value: string}}}  amounts as decimal text
 */
export function movementSummary(rows) {
  const openingRow = rows.find(isOpeningRow);
  const publicPrice = openingRow?.public_price ?? null;
  const movements = rows.filter((row) => !isOpeningRow(row));

  const operations = OPERATIONS.map(({ name, direction }) => {
    const its = movements.filter((row) => row.operation === name);
    const quantity = sum(its, 'quantity');
    const value = sum(its, 'value');
    const priced = its.filter((row) => row.net_amount !== null && row.net_amount !== undefined);
    return {
      name,
      direction,
      documents: new Set(its.map((row) => `${row.document_type} ${row.document_id}`)).size,
      quantity: plain(quantity),
      value: plain(value),
      discountPercent: priced.length > 0
        ? discountOff(sum(priced, 'net_amount'), sum(priced, 'quantity'), publicPrice) : null,
      costDiscountPercent: discountOff(value, quantity, publicPrice),
    };
  });

  const totalOf = (direction) => {
    const its = movements.filter((row) => row.direction === direction);
    return { quantity: sum(its, 'quantity'), value: sum(its, 'value') };
  };
  const opening = { quantity: Big(String(openingRow?.quantity ?? 0)), value: Big(String(openingRow?.value ?? 0)) };
  const totalIn = totalOf('in');
  const totalOut = totalOf('out');
  const asText = ({ quantity, value }) => ({ quantity: plain(quantity), value: plain(value) });
  return {
    publicPrice,
    opening: asText(opening),
    operations,
    totalIn: asText(totalIn),
    totalOut: asText(totalOut),
    closing: asText({
      quantity: opening.quantity.add(totalIn.quantity).subtract(totalOut.quantity),
      value: opening.value.add(totalIn.value).subtract(totalOut.value),
    }),
  };
}

/**
 * The stock now (productStockReport) split into its warehouse rows and its batch rows.
 *
 * @returns {{warehouses: Array<object>, batches: Array<object>}}
 */
export function splitStockRows(rows) {
  return {
    warehouses: rows.filter((row) => row.row_kind === 'warehouse'),
    batches: rows.filter((row) => row.row_kind === 'batch'),
    serials: rows.filter((row) => row.row_kind === 'serial'),
  };
}

/** The serials table's rows of the tab: the serials its kinds of document moved (every one for the first tab). */
export function tabSerialRows(serialRows, tab) {
  return serialRows.filter((row) => tab.documentTypes === null || tab.documentTypes.includes(row.document_type));
}

/**
 * The stock's total row over the rows shown: their quantities and values added up, and the average discount of them
 * all together (their value as a discount off the public price).
 *
 * @param {Array<object>} rows  stock rows (of one kind)
 * @param {string|null} publicPrice
 * @param {string} labelColumn  the column the label goes in
 */
export function stockTotalRow(rows, publicPrice, labelColumn) {
  const quantity = sum(rows, 'quantity');
  const value = sum(rows, 'value');
  return {
    [labelColumn]: `الإجمالي (${rows.length})`,
    quantity: plain(quantity),
    reserved_quantity: plain(sum(rows, 'reserved_quantity')),
    free_quantity: plain(sum(rows, 'free_quantity')),
    serialized_quantity: plain(sum(rows, 'serialized_quantity')),
    value: plain(value),
    public_value: plain(sum(rows, 'public_value')),
    average_discount_percent: discountOff(value, quantity, publicPrice),
  };
}

/**
 * The serials table's rows of a movement row (by batch): the serials its document moved in or out of that batch in that
 * warehouse. The serials report says the direction in Arabic (وارد / منصرف), the movements report as in / out.
 */
export function movementSerialRows(serialRows, row) {
  const direction = row.direction === 'in' ? 'وارد' : 'منصرف';
  return serialRows.filter((serial) => serial.document_type === row.document_type
    && String(serial.document_id) === String(row.document_id)
    && String(serial.warehouse_id) === String(row.warehouse_id)
    && serial.batch_number === row.batch_number
    && serial.direction === direction);
}
