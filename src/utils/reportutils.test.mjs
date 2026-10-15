// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuery } from 'react-querybuilder/formatQuery';
import {
  buildLinkUrl,
  formatQueryProblems,
  parseJsonObject,
  selectReportParams,
  transformFields,
  validateReportParams,
  validateReportQuery,
} from './reportutils.js';

// Shaped like the backend's report columns (the columns of GET /api/report/{name}/metadata)
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
  assert.ok(!isValid(query({ field: 'opens_at', operator: 'between', value: '08:00,' })));
  assert.ok(!isValid(query({ field: 'birth_date', operator: 'between', value: '2026-01-01' })));
  assert.ok(!isValid(query({ field: 'birth_date', operator: 'between', value: '2026-01-01,2026-02-01,2026-03-01' })));
});

test('between is offered for dates and times but not date-times', () => {
  assert.ok(isValid(query({ field: 'opens_at', operator: 'between', value: '08:00,17:00' })));
  assert.ok(isValid(query({ field: 'birth_date', operator: 'notBetween', value: '2026-01-01,2026-12-31' })));
  // Even well-formed values: the operator itself is rejected
  assert.ok(!isValid(query({ field: 'created_at', operator: 'between', value: '2026-09-01T00:00,2026-09-30T00:00' })));
  assert.ok(!isValid(query({ field: 'created_at', operator: 'notBetween', value: '2026-09-01T00:00,2026-09-30T00:00' })));
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

// --- report params (search params 1) ---

// Shaped like the backend's report params (the params of GET /api/report/{name}/metadata)
const paramFields = [
  { fieldName: 'p_text', validationType: 'string', validation: '5', required: true },
  { fieldName: 'p_number', validationType: 'number', validation: '38,10', required: false },
  { fieldName: 'p_date', validationType: 'date', required: false },
  { fieldName: 'p_link', validationType: 'link', required: false },
  { fieldName: 'p_flag', validationType: 'boolean', required: false },
];

test('params from the URL are read as an object, anything else falls back', () => {
  const fallback = { fallback: true };
  assert.deepEqual(parseJsonObject('{"p_text":"a"}', fallback), { p_text: 'a' });
  assert.equal(parseJsonObject(undefined, fallback), fallback);
  assert.equal(parseJsonObject('', fallback), fallback);
  assert.equal(parseJsonObject('{broken', fallback), fallback);
  assert.equal(parseJsonObject('null', fallback), fallback);
  assert.equal(parseJsonObject('[1,2]', fallback), fallback);
  assert.equal(parseJsonObject('"text"', fallback), fallback);
});

test('only declared params are sent, empty ones as null', () => {
  assert.deepEqual(
    selectReportParams(paramFields, { p_text: 'abc', p_number: '', p_flag: false, p_removed: 'old' }),
    { p_text: 'abc', p_number: null, p_date: null, p_link: null, p_flag: false },
  );
  assert.deepEqual(selectReportParams([], { p_text: 'abc' }), {});
});

test('params are checked like the CRUD form fields', () => {
  const allValid = (values) => Object.values(validateReportParams(paramFields, values)).every(Boolean);

  assert.ok(allValid({ p_text: 'abc' }), 'optional params may be empty');
  assert.ok(allValid({ p_text: 'abc', p_number: '-12.5', p_date: '2026-10-10', p_link: '7', p_flag: true }));

  assert.deepEqual(validateReportParams(paramFields, {}),
    { p_text: false, p_number: true, p_date: true, p_link: true, p_flag: true },
    'a required param needs a value');
  assert.ok(!allValid({ p_text: 'abcdef' }), 'longer than the string limit');
  assert.ok(!allValid({ p_text: 'abc', p_number: 'abc' }));
  assert.ok(!allValid({ p_text: 'abc', p_date: 'not a date' }));
  assert.ok(!allValid({ p_text: 'abc', p_date: '2026-02-30' }), 'no such date');
  assert.ok(!allValid({ p_text: 'abc', p_date: '2026-10-1' }), 'not in the YYYY-MM-DD format');
  assert.ok(!allValid({ p_text: 'abc', p_link: 'x' }));
});

// --- linked cells ---

const categoryLink = { schemaName: 'customer_categories', idColumn: 'id', formTitle: 'ادخال تصنيف العملاء' };

test("a linked cell opens the CRUD form of the row's record", () => {
  const url = buildLinkUrl(categoryLink, { id: 7, name: 'جملة' });
  assert.equal(url, '/dashboard/form?schemaName=customer_categories'
    + `&formTitle=${encodeURIComponent('ادخال تصنيف العملاء')}&entityId=7`);

  // The same parameters the CRUD form (SchemaCrud) reads
  const params = new URLSearchParams(url.split('?')[1]);
  assert.deepEqual(Object.fromEntries(params), {
    schemaName: 'customer_categories', formTitle: 'ادخال تصنيف العملاء', entityId: '7',
  });
});

test("the id comes from the link's id column, not the clicked column", () => {
  const link = { schemaName: 'customer_categories', idColumn: 'customer_category_id', formTitle: 'T' };
  const row = { id: 1, customer_category_id: '42', customer_category_name: 'x' };
  assert.equal(new URLSearchParams(buildLinkUrl(link, row).split('?')[1]).get('entityId'), '42');
});

test('a row without an id has no link', () => {
  assert.equal(buildLinkUrl(categoryLink, { id: null }), null);
  assert.equal(buildLinkUrl(categoryLink, { id: '' }), null);
  assert.equal(buildLinkUrl(categoryLink, {}), null);
  assert.equal(buildLinkUrl(categoryLink, undefined), null);
  assert.notEqual(buildLinkUrl(categoryLink, { id: 0 }), null, '0 is a valid id');
});

test('link values are encoded', () => {
  const url = buildLinkUrl({ schemaName: 'customers', idColumn: 'id', formTitle: 'a&b=c' }, { id: '1&x=2' });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('formTitle'), 'a&b=c');
  assert.equal(params.get('entityId'), '1&x=2');
  assert.equal(params.get('x'), null);
});

// --- date checks of the form fields (validateFormField, used by the CRUD forms and the report params) ---

test('dates, times and date-times are checked strictly against their format', async () => {
  const { validateFormField } = await import('./formValidation.js');
  const valid = (type, value) => validateFormField(type, true, null, value);

  assert.ok(valid('date', '2024-02-29'));
  assert.ok(!valid('date', '2026-02-29'), 'not a leap year');
  assert.ok(!valid('date', '2026-13-01'));
  assert.ok(!valid('date', '2026-10-10T08:30:00'), 'a date-time is not a date');

  assert.ok(valid('time', '08:30:00'));
  assert.ok(!valid('time', '25:00:00'));
  assert.ok(!valid('time', '08:30'), 'seconds are part of the format');

  assert.ok(valid('datetime', '2026-10-10T08:30:00'));
  assert.ok(!valid('datetime', '2026-10-10T08:30'), 'the backend now always sends seconds');
  assert.ok(!valid('datetime', '2026-02-30T08:30:00'));
  assert.ok(!valid('datetime', '2026-10-10 08:30:00'));
});
