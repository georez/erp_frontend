// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceColumns, statementLineColumns, statementSummary } from './statement.js';

// Shaped like a statement report's rows: the opening row, then the lines with the balance after each
const rows = [
  { description: 'رصيد أول المدة', debit: null, credit: null, balance: '1000' },
  { description: 'a', debit: '300.1', credit: '0', balance: '1300.1' },
  { description: 'b', debit: '0', credit: '1500.2', balance: '-200.1' },
  { description: 'c', debit: '0.0000001', credit: '0', balance: '-200.0999999' },
];

test('the summary adds up the lines exactly, without the opening row', () => {
  assert.deepEqual(statementSummary(rows),
    { opening: '1000', debit: '300.1000001', credit: '1500.2', closing: '-200.0999999' });
});

test('a statement with only its opening row closes where it opens', () => {
  assert.deepEqual(statementSummary(rows.slice(0, 1)), { opening: '1000', debit: '0', credit: '0', closing: '1000' });
  assert.equal(statementSummary([]), null);
});

test('a balance in two columns: debit when positive, credit when negative', () => {
  assert.deepEqual(balanceColumns('1300.1'), { debit: '1,300.10', credit: '' });
  assert.deepEqual(balanceColumns('-200.1'), { debit: '', credit: '200.10' });
  assert.deepEqual(balanceColumns('0'), { debit: '', credit: '' });
  assert.deepEqual(balanceColumns(null), { debit: '', credit: '' });
});

test("an account statement's lines show their account under a parent, and their party when they have one", () => {
  const supplierLines = [{ account_id: '17', party_name: 'مورد 1' }, { account_id: '17', party_name: 'مورد 1' }];
  assert.deepEqual(statementLineColumns('account', '17', supplierLines), { showAccount: false, showParty: true },
    'one supplier in the period is still shown');
  assert.deepEqual(statementLineColumns('account', 9, [{ account_id: '15' }]), { showAccount: true, showParty: false },
    "a parent account's lines, even all on one account under it");
  assert.deepEqual(statementLineColumns('account', '13', [{ account_id: '13', party_name: null }]),
    { showAccount: false, showParty: false });
});

test("a supplier statement's lines never repeat the supplier", () => {
  assert.deepEqual(statementLineColumns('supplier', '3', [{ account_id: '17', party_name: 'مورد 1' }]),
    { showAccount: false, showParty: false });
  assert.deepEqual(statementLineColumns('supplier', '3', [{ account_id: '17' }, { account_id: '40' }]),
    { showAccount: true, showParty: false });
});
