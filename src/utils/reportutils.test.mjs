// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuery } from 'react-querybuilder/formatQuery';
import {
  linkTarget,
  formatQueryProblems,
  parseJsonObject,
  parseReportSort,
  selectReportParams,
  selectReportSort,
  totalsRow,
  transformFields,
  paramOrderProblem,
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

test('a period may not end before it starts', () => {
  const periodFields = [
    { fieldName: 'p_from_date', displayName: 'من تاريخ', validationType: 'date', required: true },
    { fieldName: 'p_to_date', displayName: 'حتى تاريخ', validationType: 'date', required: true,
      notBefore: 'p_from_date' },
  ];
  const period = (from, to) => ({ p_from_date: from, p_to_date: to });

  assert.deepEqual(validateReportParams(periodFields, period('2026-10-01', '2026-10-31')),
    { p_from_date: true, p_to_date: true });
  assert.equal(paramOrderProblem(periodFields, period('2026-10-01', '2026-10-01')), null, 'one day is a period');

  assert.deepEqual(validateReportParams(periodFields, period('2026-10-31', '2026-10-01')),
    { p_from_date: true, p_to_date: false });
  assert.equal(paramOrderProblem(periodFields, period('2026-10-31', '2026-10-01')),
    'المعيار "حتى تاريخ" لا يمكن أن يكون قبل "من تاريخ"');

  assert.equal(paramOrderProblem(periodFields, period('not a date', '2026-10-01')), null,
    "an invalid date is its own field's problem");
});

// --- linked cells ---

const categoryLink = { schemaName: 'customer_categories', idColumn: 'id', formTitle: 'ادخال تصنيف العملاء' };

/** The URL a linked cell opens, or null. */
const linkUrl = (link, row) => linkTarget(link, row)?.url ?? null;

test("a linked cell opens the CRUD form of the row's record", () => {
  const target = linkTarget(categoryLink, { id: 7, name: 'جملة' });
  assert.equal(target.url, '/dashboard/form?schemaName=customer_categories'
    + `&formTitle=${encodeURIComponent('ادخال تصنيف العملاء')}&entityId=7`);
  assert.equal(target.title, 'ادخال تصنيف العملاء');

  // The same parameters the CRUD form (SchemaCrud) reads
  const params = new URLSearchParams(target.url.split('?')[1]);
  assert.deepEqual(Object.fromEntries(params), {
    schemaName: 'customer_categories', formTitle: 'ادخال تصنيف العملاء', entityId: '7',
  });
});

test("a document's link opens its page with the id in the page's parameter", () => {
  const link = { document: 'stock-adjustment', idColumn: 'id', formTitle: 'تسوية' };
  assert.deepEqual(linkTarget(link, { id: 3 }), {
    url: `/dashboard/stock-adjustment?formTitle=${encodeURIComponent('تسوية')}&adjustmentId=3`,
    title: 'تسوية',
  }, "titled with the link's formTitle");
  assert.equal(linkUrl({ ...link, document: 'no-such-page' }, { id: 3 }), null);
  assert.equal(linkUrl({ document: 'purchase-invoice', idColumn: 'id', formTitle: 'F' }, { id: 4 }),
    '/dashboard/purchase-invoice?formTitle=F&invoiceId=4');
  assert.equal(linkUrl({ document: 'purchase-return', idColumn: 'id', formTitle: 'R' }, { id: 5 }),
    '/dashboard/purchase-return?formTitle=R&returnId=5');
  assert.equal(linkUrl({ document: 'opening-balance', idColumn: 'id', formTitle: 'O' }, { id: 6 }),
    '/dashboard/opening-balance?formTitle=O&openingBalanceId=6');
  assert.equal(linkUrl({ ...link, document: 'constructor' }, { id: 3 }), null);
});

test('a documentColumn link opens the page each row names, titled after that page', () => {
  const link = { documentColumn: 'page', idColumn: 'source_id' };
  assert.deepEqual(linkTarget(link, { page: 'purchase-invoice', source_id: '8' }), {
    url: `/dashboard/purchase-invoice?formTitle=${encodeURIComponent('فاتورة مشتريات')}&invoiceId=8`,
    title: 'فاتورة مشتريات',
  });
  assert.deepEqual(linkTarget(link, { page: 'purchase-return', source_id: '9' }), {
    url: `/dashboard/purchase-return?formTitle=${encodeURIComponent('مرتجع مشتريات')}&returnId=9`,
    title: 'مرتجع مشتريات',
  });
  assert.deepEqual(linkTarget(link, { page: 'payment', source_id: '5' }), {
    url: `/dashboard/payment?formTitle=${encodeURIComponent('سند صرف')}&paymentId=5`,
    title: 'سند صرف',
  });
  assert.equal(linkTarget(link, { page: null, source_id: '9' }), null, 'a row without a document (an opening row)');
  assert.equal(linkTarget(link, { page: 'no-such-page', source_id: '9' }), null);
  assert.equal(linkTarget(link, { page: 'toString', source_id: '9' }), null);
  assert.equal(linkTarget(link, { page: 'purchase-invoice', source_id: null }), null);
});

test("the id comes from the link's id column, not the clicked column", () => {
  const link = { schemaName: 'customer_categories', idColumn: 'customer_category_id', formTitle: 'T' };
  const row = { id: 1, customer_category_id: '42', customer_category_name: 'x' };
  assert.equal(new URLSearchParams(linkUrl(link, row).split('?')[1]).get('entityId'), '42');
});

test('a row without an id has no link', () => {
  assert.equal(linkTarget(categoryLink, { id: null }), null);
  assert.equal(linkTarget(categoryLink, { id: '' }), null);
  assert.equal(linkTarget(categoryLink, {}), null);
  assert.equal(linkTarget(categoryLink, undefined), null);
  assert.notEqual(linkTarget(categoryLink, { id: 0 }), null, '0 is a valid id');
});

test('link values are encoded', () => {
  const url = linkUrl({ schemaName: 'customers', idColumn: 'id', formTitle: 'a&b=c' }, { id: '1&x=2' });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('formTitle'), 'a&b=c');
  assert.equal(params.get('entityId'), '1&x=2');
  assert.equal(params.get('x'), null);
});

// --- the total row ---

const ledgerTotals = {
  label: 'الإجمالي', labelColumn: 'account_name', columns: ['debit', 'credit'], skipRowsWhere: 'is_parent',
};

test('the total row adds up the rows exactly, without the skipped ones', () => {
  const rows = [
    { account_name: 'Assets', is_parent: true, debit: '300.3', credit: '0' },
    { account_name: 'Cash', is_parent: false, debit: '100.1', credit: '0' },
    { account_name: 'Bank', is_parent: false, debit: '200.2', credit: '0.0000001' },
    { account_name: 'Capital', is_parent: false, debit: '0', credit: '300.3' },
  ];
  assert.deepEqual(totalsRow(rows, ledgerTotals),
    { account_name: 'الإجمالي', debit: '300.3', credit: '300.3000001' }, 'no floating point drift; parents skipped');
});

test('the total row counts every row without skipRowsWhere, and empty cells as nothing', () => {
  const totals = { label: 'T', labelColumn: 'name', columns: ['value'] };
  assert.deepEqual(totalsRow([{ value: '1.5' }, { value: null }, { value: '' }, { value: 2 }], totals),
    { name: 'T', value: '3.5' });
  assert.deepEqual(totalsRow([], totals), { name: 'T', value: '0' });
});

// --- the sort tab ---

const sortColumns = [
  { name: 'id', sortable: true },
  { name: 'name', sortable: true },
  { name: 'uuid_value', sortable: false },
];

test('the sort kept in the URL is a list, or nothing', () => {
  assert.deepEqual(parseReportSort('[{"column":"id","direction":"desc"}]'), [{ column: 'id', direction: 'desc' }]);
  assert.deepEqual(parseReportSort(undefined), []);
  assert.deepEqual(parseReportSort(''), []);
  assert.deepEqual(parseReportSort('{"column":"id"}'), [], 'an object is not a sort');
  assert.deepEqual(parseReportSort('[{'), [], 'unreadable JSON');
});

test('the sort sent keeps its order and only usable entries', () => {
  assert.deepEqual(selectReportSort([
    { column: 'name', direction: 'desc' },
    { column: 'id', direction: 'asc' },
  ], sortColumns, false), [{ column: 'name', direction: 'desc' }, { column: 'id', direction: 'asc' }]);

  assert.deepEqual(selectReportSort([
    { column: 'gone', direction: 'asc' },
    { column: 'uuid_value', direction: 'asc' },
    { column: 'id', direction: 'sideways' },
    null,
    { column: 'name', direction: 'asc', extra: 'x' },
    { column: 'name', direction: 'desc' },
  ], sortColumns, false), [{ column: 'name', direction: 'asc' }],
  'unknown, unsortable, badly directed, empty and repeated entries are dropped; extra keys too');

  assert.deepEqual(selectReportSort('not a list', sortColumns, false), []);
});

test('a report with a fixed order takes no sort', () => {
  assert.deepEqual(selectReportSort([{ column: 'id', direction: 'asc' }], sortColumns, true), []);
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
