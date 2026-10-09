// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuery } from 'react-querybuilder/formatQuery';
import { formatQueryProblems, transformFields, validateReportQuery } from './reportutils.js';

// Shaped like the backend's report columns (GET /api/report/{name}/searchparams2)
const fields = transformFields([
  { name: 'id', label: 'id', inputType: 'number' },
  { name: 'name', label: 'name' },
  { name: 'created_at', label: 'created_at', inputType: 'datetime-local' },
  { name: 'birth_date', label: 'birth_date', inputType: 'date' },
  { name: 'opens_at', label: 'opens_at', inputType: 'time' },
  { name: 'active', label: 'active', valueEditorType: 'checkbox' },
]);

const query = (...rules) => ({ combinator: 'and', rules });
const problemsFor = (q) => validateReportQuery(q, fields);
const isValid = (q) => problemsFor(q).length === 0;

test('valid queries pass', () => {
  assert.ok(isValid(query()));
  assert.ok(isValid(query({ field: 'id', operator: '=', value: '5' })));
  assert.ok(isValid(query({ field: 'id', operator: '>=', value: -2.5 })));
  assert.ok(isValid(query({ field: 'name', operator: 'contains', value: 'abc' })));
  assert.ok(isValid(query({ field: 'name', operator: 'in', value: 'a,b,c' })));
  assert.ok(isValid(query({ field: 'created_at', operator: '=', value: '2026-10-08T15:30' })));
  assert.ok(isValid(query({ field: 'created_at', operator: '<', value: '2026-10-08T15:30:59' })));
  assert.ok(isValid(query({ field: 'birth_date', operator: 'between', value: '2026-01-01,2026-12-31' })));
  assert.ok(isValid(query({ field: 'birth_date', operator: 'between', value: ['2026-01-01', '2026-12-31'] })));
  assert.ok(isValid(query({ field: 'opens_at', operator: '=', value: '08:00' })));
  assert.ok(isValid(query({ field: 'active', operator: '=', value: false })));
  assert.ok(isValid({ combinator: 'or', not: true, rules: [query({ field: 'id', operator: '=', value: '1' })] }));
});

test('is null / is not null need no value', () => {
  // These used to be rejected because the old validator required a value
  assert.ok(isValid(query({ field: 'id', operator: 'null', value: '' })));
  assert.ok(isValid(query({ field: 'name', operator: 'notNull', value: '' })));
  assert.ok(isValid(query({ field: 'created_at', operator: 'null', value: '' })));
});

test('empty or malformed values are rejected', () => {
  // The reported case: a datetime rule left blank
  assert.ok(!isValid(query({ field: 'created_at', operator: '=', value: '' })));
  assert.ok(!isValid(query({ field: 'created_at', operator: '=', value: '   ' })));
  assert.ok(!isValid(query({ field: 'created_at', operator: '=', value: 'garbage' })));
  assert.ok(!isValid(query({ field: 'created_at', operator: '=', value: '2026-02-30T10:00' }))); // no such date
  assert.ok(!isValid(query({ field: 'created_at', operator: '=', value: '2026-10-08T25:00' }))); // no such time
  assert.ok(!isValid(query({ field: 'birth_date', operator: '=', value: '2026-13-01' })));
  assert.ok(!isValid(query({ field: 'opens_at', operator: '=', value: '8am' })));
  assert.ok(!isValid(query({ field: 'id', operator: '=', value: 'abc' })));
  assert.ok(!isValid(query({ field: 'id', operator: '=', value: '' })));
  assert.ok(!isValid(query({ field: 'name', operator: '=', value: '' })));
  assert.ok(!isValid(query({ field: 'name', operator: 'in', value: 'a,,b' })));
  assert.ok(!isValid(query({ field: 'active', operator: '=', value: 'maybe' })));
});

test('between needs two well-formed values', () => {
  // Used to pass as valid and generate "(1 = 1)", returning every row
  assert.ok(!isValid(query({ field: 'created_at', operator: 'between', value: '2026-01-01T00:00,' })));
  assert.ok(!isValid(query({ field: 'birth_date', operator: 'between', value: '2026-01-01' })));
  assert.ok(!isValid(query({ field: 'birth_date', operator: 'between', value: '2026-01-01,2026-02-01,2026-03-01' })));
});

test('crafted queries that would inject SQL are rejected', () => {
  assert.ok(!isValid(query({ field: 'password', operator: '=', value: 'x' })));
  assert.ok(!isValid(query({
    field: 'created_at is null or (select count(*) from accounts) > 0 or created_at', operator: 'null', value: '',
  })));
  assert.ok(!isValid(query({ field: 'created_at', operator: '= created_at or 1=1 or created_at =', value: '2026-01-01T00:00' })));
  assert.ok(!isValid(query({ field: 'id', operator: 'contains', value: '1' }))); // operator not offered for numbers
  assert.ok(!isValid({
    combinator: 'or (select 1) = 1 or',
    rules: [{ field: 'name', operator: '=', value: 'a' }, { field: 'name', operator: '=', value: 'b' }],
  }));
  assert.ok(!isValid(query({ field: 'name', operator: '=', value: 'id', valueSource: 'field' })));
  assert.ok(!isValid(query({ field: 'name', operator: '=', value: 'a' }, 'or 1=1 or', { field: 'name', operator: '=', value: 'b' })));
  assert.ok(!isValid({ combinator: 'and', rules: [{ combinator: 'and; drop table x', rules: [] }] }));
  assert.ok(!isValid(null));
  assert.ok(!isValid({ combinator: 'and' }));
});

test('problems say where and what', () => {
  const problems = problemsFor(query(
    { field: 'id', operator: '=', value: '1' },
    { combinator: 'and', rules: [{ field: 'created_at', operator: '=', value: '' }] },
  ));
  assert.deepEqual(problems, [{ path: [1, 0], message: 'قيمة غير صحيحة للحقل created_at' }]);
});

test('the problem message lists every problem (shown by the route and the report screen)', () => {
  const problems = problemsFor(query(
    { field: 'created_at', operator: '=', value: '' },
    { field: 'id', operator: '=', value: 'abc' },
  ));
  assert.equal(formatQueryProblems(problems),
    'استعلام التقرير غير صحيح: قيمة غير صحيحة للحقل created_at، قيمة غير صحيحة للحقل id');
});

test('a valid between query generates SQL with both values', () => {
  const q = query({ field: 'birth_date', operator: 'between', value: '2026-01-01,2026-12-31' });
  assert.ok(isValid(q));
  const { sql, params } = formatQuery(q, { format: 'parameterized_named', fields });
  assert.notEqual(sql, '(1 = 1)');
  assert.deepEqual(Object.values(params), ['2026-01-01', '2026-12-31']);
});
