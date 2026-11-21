import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discountOff, MOVEMENT_TABS, movementSerialRows, movementSummary, splitStockRows, stockTotalRow, tabColumns, tabRows,
} from './productMovements.js';
import { Big } from 'bigdecimal.js';

// A product at 100: 30 before the period, then a purchase in, two sales out (one in two batch rows) and a transfer
const ROWS = [
  { row_order: 0, operation: 'رصيد أول المدة', quantity: '30', value: '2250', public_price: '100.00' },
  { row_order: 1, document_type: 'purchase_invoice', document_id: '7', operation: 'مشتريات', direction: 'in',
    quantity: '10', value: '750', net_amount: '750' },
  { row_order: 1, document_type: 'sales_invoice', document_id: '8', operation: 'مبيعات', direction: 'out',
    quantity: '6', value: '450', net_amount: '480' },
  { row_order: 1, document_type: 'sales_invoice', document_id: '8', operation: 'مبيعات', direction: 'out',
    quantity: '2', value: '150', net_amount: '160' },
  { row_order: 1, document_type: 'sales_invoice', document_id: '9', operation: 'مبيعات', direction: 'out',
    quantity: '2', value: '150', net_amount: '170' },
  { row_order: 1, document_type: 'stock_transfer', document_id: '3', operation: 'تحويل صادر', direction: 'out',
    quantity: '5', value: '375' },
  { row_order: 1, document_type: 'stock_transfer', document_id: '3', operation: 'تحويل وارد', direction: 'in',
    quantity: '5', value: '375' },
];

const tab = (key) => MOVEMENT_TABS.find((candidate) => candidate.key === key);

test('a tab has the movements of its kinds of document; the first has them all, never the opening row', () => {
  assert.equal(tabRows(ROWS, tab('all')).length, 6);
  assert.deepEqual(tabRows(ROWS, tab('sales')).map((row) => row.document_id), ['8', '8', '9']);
  assert.deepEqual(tabRows(ROWS, tab('transfers')).map((row) => row.operation), ['تحويل صادر', 'تحويل وارد']);
  assert.deepEqual(tabRows(ROWS, tab('adjustments')), []);
});

test('a tab shows the batch columns by batch only, and may name a column its own way', () => {
  const fields = (byBatch) => tabColumns(tab('sales'), byBatch).map(({ field }) => field);
  assert.ok(!fields(false).includes('batch_number'));
  assert.deepEqual(fields(true).slice(2, 5), ['warehouse_name', 'batch_number', 'expiry_date']);
  assert.deepEqual(tabColumns(tab('sales'), true, true).map(({ field }) => field).slice(2, 6),
    ['warehouse_name', 'batch_number', 'expiry_date', 'serial_number'], 'one row per serial');

  const party = tabColumns(tab('sales'), false).find(({ field }) => field === 'party_name');
  assert.equal(party.header, 'العميل');
  assert.equal(tabColumns(tab('all'), false).find(({ field }) => field === 'party_name').header, undefined);
});

test('a discount is the amount off the public price, to 3 decimals', () => {
  assert.equal(discountOff(Big('640'), Big('8'), '100.00'), '20');
  assert.equal(discountOff(Big('100'), Big('3'), '100'), '66.667');
  assert.equal(discountOff(Big('120'), Big('1'), '100'), '-20', 'over the public price');
  assert.equal(discountOff(null, Big('1'), '100'), null);
  assert.equal(discountOff(Big('1'), Big('0'), '100'), null);
  assert.equal(discountOff(Big('1'), Big('1'), '0'), null);
});

test('the summary adds up each operation from the opening balance to the closing one', () => {
  const summary = movementSummary(ROWS);

  assert.equal(summary.publicPrice, '100.00');
  assert.deepEqual(summary.opening, { quantity: '30', value: '2250' });
  assert.deepEqual(summary.totalIn, { quantity: '15', value: '1125' });
  assert.deepEqual(summary.totalOut, { quantity: '15', value: '1125' });
  assert.deepEqual(summary.closing, { quantity: '30', value: '2250' });

  const sales = summary.operations.find(({ name }) => name === 'مبيعات');
  // 810 for 10 at 100: 19% off on average; cost 750, 25% off
  assert.deepEqual(sales, { name: 'مبيعات', direction: 'out', documents: 2, quantity: '10', value: '750',
    discountPercent: '19', costDiscountPercent: '25' });
  const transferIn = summary.operations.find(({ name }) => name === 'تحويل وارد');
  assert.equal(transferIn.discountPercent, null, 'a transfer has no price');
  assert.equal(transferIn.costDiscountPercent, '25');
});

test('every operation is in the summary, in its order, even without movements', () => {
  const summary = movementSummary(ROWS.slice(0, 1));

  assert.equal(summary.operations.length, 9);
  assert.deepEqual(summary.operations.map(({ direction }) => direction),
    ['in', 'in', 'in', 'in', 'in', 'out', 'out', 'out', 'out']);
  assert.deepEqual(summary.operations[0], { name: 'رصيد افتتاحي', direction: 'in', documents: 0, quantity: '0',
    value: '0', discountPercent: null, costDiscountPercent: null });
  assert.deepEqual(summary.closing, { quantity: '30', value: '2250' });
});

test('the stock is split into warehouses and batches, and totalled with its average discount', () => {
  const stock = [
    { row_kind: 'warehouse', warehouse_name: 'main', quantity: '17', reserved_quantity: '0', free_quantity: '17',
      serialized_quantity: '3', value: '1275', public_value: '1700' },
    { row_kind: 'warehouse', warehouse_name: 'branch', quantity: '5', reserved_quantity: '2', free_quantity: '3',
      serialized_quantity: '0', value: '400', public_value: '500' },
    { row_kind: 'batch', warehouse_name: 'main', batch_number: 'A', quantity: '17' },
  ];
  const { warehouses, batches } = splitStockRows(stock);
  assert.equal(warehouses.length, 2);
  assert.equal(batches.length, 1);

  assert.deepEqual(stockTotalRow(warehouses, '100', 'warehouse_name'), {
    warehouse_name: 'الإجمالي (2)', quantity: '22', reserved_quantity: '2', free_quantity: '20',
    serialized_quantity: '3', value: '1675', public_value: '2200', average_discount_percent: '23.864',
  });
});

test('a movement row\'s serials are those its document moved, in its direction, batch and warehouse', () => {
  const serial = (number, overrides) => ({
    document_type: 'stock_transfer', document_id: 4, warehouse_id: 1, batch_number: 'A', direction: 'منصرف',
    serial_number: number, ...overrides,
  });
  const serials = [
    serial('S1'), serial('S2'),
    // The same transfer's piece coming into the other warehouse, another batch's, another document's
    serial('S1', { warehouse_id: 2, direction: 'وارد' }), serial('S3', { batch_number: 'B' }),
    serial('S4', { document_id: 5 }), serial('S5', { document_type: 'sales_invoice' }),
  ];
  const row = { document_type: 'stock_transfer', document_id: '4', warehouse_id: '1', batch_number: 'A',
    direction: 'out' };

  assert.deepEqual(movementSerialRows(serials, row).map((s) => s.serial_number), ['S1', 'S2']);
  assert.deepEqual(movementSerialRows(serials, { ...row, warehouse_id: '2', direction: 'in' })
    .map((s) => `${s.serial_number} ${s.warehouse_id}`), ['S1 2']);
});
