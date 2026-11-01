// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountTree, parentAccountIds, treeDepth, visibleTreeRows } from './trialBalanceTree.js';

// Shaped like trialBalanceReport's rows, in sort_path order:
// 1 root
//   2 assets
//     4 cash
//     5 bank
//   3 capital
// 9 other root
const row = (id, sortPath) => ({ account_id: id, sort_path: sortPath });
const rows = [
  row('1', '01'),
  row('2', '01/02'),
  row('4', '01/02/04'),
  row('5', '01/02/05'),
  row('3', '01/03'),
  row('9', '09'),
];

const ids = (items) => items.map((item) => item.row.account_id);

test('the rows become a tree by their sort paths', () => {
  const roots = buildAccountTree(rows);
  assert.deepEqual(roots.map((node) => node.row.account_id), ['1', '9']);
  assert.deepEqual(roots[0].children.map((node) => node.row.account_id), ['2', '3']);
  assert.deepEqual(roots[0].children[0].children.map((node) => node.row.account_id), ['4', '5']);
  assert.equal(treeDepth(roots), 3);
  assert.equal(treeDepth([]), 0);
});

test('an account whose parent is missing is a root', () => {
  const roots = buildAccountTree([row('4', '01/02/04'), row('9', '09')]);
  assert.deepEqual(roots.map((node) => node.row.account_id), ['4', '9']);
});

test('parents to expand: all of them, or down to a depth', () => {
  const roots = buildAccountTree(rows);
  assert.deepEqual([...parentAccountIds(roots)].sort(), ['1', '2']);
  assert.deepEqual([...parentAccountIds(roots, 1)], ['1'], 'roots only: shows two levels');
  assert.deepEqual([...parentAccountIds(roots, 0)], [], 'nothing expanded: roots only');
});

test('only the children of expanded accounts are shown, depth first', () => {
  const roots = buildAccountTree(rows);
  assert.deepEqual(ids(visibleTreeRows(roots, new Set())), ['1', '9']);
  assert.deepEqual(ids(visibleTreeRows(roots, new Set(['1']))), ['1', '2', '3', '9']);
  assert.deepEqual(ids(visibleTreeRows(roots, new Set(['1', '2']))), ['1', '2', '4', '5', '3', '9']);
  assert.deepEqual(ids(visibleTreeRows(roots, new Set(['2']))), ['1', '9'], 'a collapsed parent hides its children');
});

test('each row knows its depth, its toggle and its guide lines', () => {
  const items = visibleTreeRows(buildAccountTree(rows), new Set(['1', '2']));
  const byId = Object.fromEntries(items.map((item) => [item.row.account_id, item]));

  assert.deepEqual([byId['1'].depth, byId['1'].hasChildren, byId['1'].expanded], [0, true, true]);
  assert.deepEqual([byId['4'].depth, byId['4'].hasChildren, byId['4'].expanded], [2, false, false]);

  // 4 is under assets (which has capital after it) under root (which has a root after it)
  assert.deepEqual(byId['4'].ancestorHasNext, [true, true]);
  assert.equal(byId['4'].isLast, false);
  assert.equal(byId['5'].isLast, true, 'bank closes the assets branch');
  assert.deepEqual(byId['3'].ancestorHasNext, [true]);
  assert.equal(byId['3'].isLast, true);
  assert.equal(byId['9'].isLast, true);
});
