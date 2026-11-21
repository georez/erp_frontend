import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowForScan, scannedProduct } from './serialScans.js';

const isFull = (row) => row.serials.length >= row.quantity;
const row = (rowId, productId, batchNumber, expiryDate, quantity = 2, serials = []) => ({
  rowId, productId, productName: `product ${productId}`, batchNumber, expiryDate, quantity, serials,
});

// A receiving document's batch rows: product 1 in lots A (two months) and B; product 2 in A
const BATCHES = [
  row(1, 1, 'A', '2027-05-01'), row(2, 1, 'A', '2028-01-01'), row(3, 1, 'B', '2027-05-01'), row(4, 2, 'A', '2027-05-01'),
];

test('a batch row is the pack\'s product, lot and expiry month', () => {
  assert.deepEqual(rowForScan(BATCHES, [1], { batchNumber: 'A', expiryDate: '2027-05-31' }, isFull),
    { row: BATCHES[0] });
  assert.deepEqual(rowForScan(BATCHES, [1], { batchNumber: 'A', expiryDate: '2028-01-15' }, isFull),
    { row: BATCHES[1] });
});

test('a scanned lot is compared upper case, as batches keep it', () => {
  assert.deepEqual(rowForScan(BATCHES, [1], { batchNumber: 'b', expiryDate: '2027-05-01' }, isFull),
    { row: BATCHES[2] });
});

test('a receiving document\'s pack is of its GTIN\'s product, or of those sharing it the one on the document', () => {
  assert.deepEqual(scannedProduct([], [5]), { productId: 5 });
  assert.deepEqual(scannedProduct(BATCHES, [2, 5]), { productId: 2 });
  assert.match(scannedProduct(BATCHES, [1, 2]).error, /أكثر من صنف/);
  assert.match(scannedProduct([], [5, 6]).error, /أكثر من صنف/);
});

test('a product line takes the product\'s packs of any lot', () => {
  const lines = [row(7, 1, null, null)];
  assert.deepEqual(rowForScan(lines, [1], { batchNumber: 'Z', expiryDate: '2030-01-31' }, isFull), { row: lines[0] });
});

test('products sharing the GTIN may each have a row: they\'re offered to choose from', () => {
  assert.deepEqual(rowForScan(BATCHES, [1, 2], { batchNumber: 'A', expiryDate: '2027-05-31' }, isFull),
    { rows: [BATCHES[0], BATCHES[3]] });
});

test('no row of the product, of the lot, or with room left is an error', () => {
  assert.match(rowForScan(BATCHES, [9], { batchNumber: 'A', expiryDate: null }, isFull).error, /ليس في المستند/);
  assert.match(rowForScan(BATCHES, [1], { batchNumber: 'C', expiryDate: '2027-05-01' }, isFull).error,
    /لا يوجد بند للتشغيلة "C"/);
  assert.match(rowForScan(BATCHES, [1], { batchNumber: 'B', expiryDate: '2027-06-01' }, isFull).error,
    /لا يوجد بند/);
  const full = [row(1, 1, 'A', '2027-05-01', 1, [{ serialNumber: 'S1' }])];
  assert.match(rowForScan(full, [1], { batchNumber: 'A', expiryDate: '2027-05-01' }, isFull).error, /مكتملة/);
});
