// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLineAmounts, documentPageOf, partyKind, statementPeriod } from './journalEntries.js';

test("a payment's or a receipt's entry opens it", () => {
  assert.equal(documentPageOf('payment'), 'payment');
  assert.equal(documentPageOf('receipt'), 'receipt');
  assert.equal(documentPageOf('sales_invoice'), 'sales-invoice');
  assert.equal(documentPageOf('sales_return'), 'sales-return');
  assert.equal(documentPageOf('stock_transfer'), 'stock-transfer');
  assert.equal(documentPageOf('year_closing'), 'year-closing', 'a closing entry opens the year closing page');
});

test('a line has its amount on one side; the other, left empty, is zero', () => {
  assert.deepEqual(checkLineAmounts('1250.5', ''), { debit: '1250.5', credit: '0' });
  assert.deepEqual(checkLineAmounts('', '٣٠٠'), { debit: '0', credit: '300' }, 'Arabic digits');
  assert.deepEqual(checkLineAmounts('0', '7'), { debit: '0', credit: '7' });
});

test("a line's amounts are refused on both sides or on neither", () => {
  assert.ok(checkLineAmounts('5', '5').errors.credit);
  assert.ok(checkLineAmounts('', '').errors.debit);
  assert.ok(checkLineAmounts('0', '0.000').errors.debit);
});

test('an amount is a positive number with up to 7 decimals and 18 digits', () => {
  assert.ok(checkLineAmounts('-5', '').errors.debit);
  assert.ok(checkLineAmounts('', 'abc').errors.credit);
  assert.ok(checkLineAmounts('1,5', '').errors.debit, 'a comma may be a decimal point: refused');
  assert.ok(checkLineAmounts('0.12345678', '').errors.debit);
  assert.deepEqual(checkLineAmounts('0.1234567', ''), { debit: '0.1234567', credit: '0' });
  assert.ok(checkLineAmounts('1234567890123456789', '').errors.debit);
  assert.deepEqual(checkLineAmounts('123456789012345678', ''), { debit: '123456789012345678', credit: '0' });
});

test("an account's subledger says the party its lines need", () => {
  assert.equal(partyKind('CUSTOMER'), 'customer');
  assert.equal(partyKind('SUPPLIER'), 'supplier');
  assert.equal(partyKind('INVENTORY'), null);
  assert.equal(partyKind(null), null);
});

test("a document's entry opens its document's page", () => {
  assert.equal(documentPageOf('purchase_invoice'), 'purchase-invoice');
  assert.equal(documentPageOf('stock_adjustment'), 'stock-adjustment');
  assert.equal(documentPageOf(null), null, 'a manual entry');
  assert.equal(documentPageOf('toString'), null);
});

test("a line's statement runs from the first of its entry's month to the day it takes effect", () => {
  const today = new Date(2026, 10, 2);
  assert.deepEqual(statementPeriod('2025-12-31T23:00:00', today),
    { p_from_date: '2025-12-01', p_to_date: '2025-12-31' });
  assert.deepEqual(statementPeriod(null, today), { p_from_date: '2026-11-01', p_to_date: '2026-11-02' },
    'a draft taking effect when posted: this month');
});
