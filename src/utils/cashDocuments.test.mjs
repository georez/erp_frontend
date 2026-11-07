// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAmount, checkCashDocument, isOverBalance } from './cashDocuments.js';

const VALID = {
  cashAccountId: 32, accountId: 29, customerId: null, supplierId: null, amount: '150.75', reference: '', description: '',
};

test('an amount is more than zero, in piasters', () => {
  assert.deepEqual(checkAmount('150.75'), { amount: '150.75' });
  assert.deepEqual(checkAmount(' ١٥٠٫٧٥ '), { amount: '150.75' }, 'Arabic digits and decimal point');
  assert.deepEqual(checkAmount('10.500'), { amount: '10.500' }, 'zeros after the second decimal are no piasters');
  for (const wrong of ['', '   ', '0', '0.00', '-5', 'abc', '1.234', '1,5']) {
    assert.ok(checkAmount(wrong).error, wrong);
  }
});

test('an amount has at most 18 digits before the decimals', () => {
  assert.deepEqual(checkAmount('1'.repeat(18)), { amount: '1'.repeat(18) });
  assert.ok(checkAmount('1'.repeat(19)).error);
});

test('a complete document has no errors', () => {
  assert.deepEqual(checkCashDocument(VALID, null), {});
});

test('the cash account, the account and the amount are required', () => {
  const errors = checkCashDocument({ ...VALID, cashAccountId: null, accountId: null, amount: '' }, null);
  assert.deepEqual(Object.keys(errors).sort(), ['accountId', 'amount', 'cashAccountId']);
});

test("the other account can't be the cash account", () => {
  assert.ok(checkCashDocument({ ...VALID, accountId: VALID.cashAccountId }, null).accountId);
});

test('the party the account needs is required', () => {
  assert.ok(checkCashDocument(VALID, 'SUPPLIER').partyId);
  assert.ok(checkCashDocument(VALID, 'CUSTOMER').partyId);
  assert.deepEqual(checkCashDocument({ ...VALID, supplierId: 7 }, 'SUPPLIER'), {});
  assert.deepEqual(checkCashDocument({ ...VALID, customerId: 7 }, 'CUSTOMER'), {});
  assert.ok(checkCashDocument({ ...VALID, supplierId: 7 }, 'CUSTOMER').partyId, 'the other kind of party is no use');
});

test('the reference and the description have limits, without the spaces around them', () => {
  assert.ok(checkCashDocument({ ...VALID, reference: '1'.repeat(101) }, null).reference);
  assert.deepEqual(checkCashDocument({ ...VALID, reference: ` ${'1'.repeat(100)} ` }, null), {});
  assert.ok(checkCashDocument({ ...VALID, description: 'ب'.repeat(501) }, null).description);
  assert.deepEqual(checkCashDocument({ ...VALID, description: 'ب'.repeat(500) }, null), {});
});

test('more than the balance is reported, exactly', () => {
  assert.equal(isOverBalance('100.01', '100.00'), true);
  assert.equal(isOverBalance('100', '100.00'), false, 'all of it is fine');
  assert.equal(isOverBalance('99.99', '100'), false);
  assert.equal(isOverBalance('1', '0'), true);
  assert.equal(isOverBalance('5', '-20'), true, 'an overdrawn account');
  assert.equal(isOverBalance('999999999999999999.99', '999999999999999999.98'), true, 'beyond a JavaScript number');
});

test('no warning until the amount and the balance are known', () => {
  assert.equal(isOverBalance('', '100'), false);
  assert.equal(isOverBalance('abc', '100'), false);
  assert.equal(isOverBalance('50', null), false);
});
