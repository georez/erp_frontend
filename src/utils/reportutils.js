import { defaultOperators, toFullOption } from "react-querybuilder";
import { Big } from "bigdecimal.js";
import { validateFormField } from "./formValidation.js";
import { errorMessageFromBody } from "./errorMessages.js";

const operatorTranslations = {
  '=': 'يساوي',
  '!=': 'لا يساوي',
  '<': 'اصغر من',
  '>': 'اكبر من',
  '<=': 'اصغر من او يساوي',
  '>=': 'اكبر من او يساوي',
  'contains': 'يحتوي علي',
  'beginsWith': 'يبدأ ب',
  'endsWith': 'ينتهي ب',
  'doesNotContain': 'لا يحتوي علي',
  'doesNotBeginWith': 'لا يبدأ ب',
  'doesNotEndWith': 'لا ينتهي ب',
  'null': 'فارغ',
  'notNull': 'ليس فارغ',
  'in': 'في',
  'notIn': 'ليس في',
  'between': 'بين',
  'notBetween': 'ليس بين'
};

export const arabicOperators = defaultOperators.map((op) => ({
  ...op,
  label: operatorTranslations[op.name] ?? op.label,
}));

// Operators whose rule has no value, two values, or a list of values
const NO_VALUE_OPERATORS = new Set(['null', 'notNull']);
const TWO_VALUE_OPERATORS = new Set(['between', 'notBetween']);
const LIST_OPERATORS = new Set(['in', 'notIn']);

function isRealDate(yyyyMmDd) {
  const [year, month, day] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isRealTime(hhMmSs) {
  const [hours, minutes, seconds = 0] = hhMmSs.split(':').map(Number);
  return hours < 24 && minutes < 60 && seconds < 60;
}

/**
 * Format checks per input type, matching what the backend parses
 * (BIGINT/NUMERIC, LocalDate, LocalTime, LocalDateTime).
 */
const VALUE_CHECKS = {
  number: (v) => /^-?\d+(\.\d+)?$/.test(v),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDate(v),
  time: (v) => /^\d{2}:\d{2}(:\d{2})?$/.test(v) && isRealTime(v),
  'datetime-local': (v) => {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(:\d{2})?)$/.exec(v);
    return !!match && isRealDate(match[1]) && isRealTime(match[2]);
  },
};

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/** Rule values for between/in come as an array or as a comma-separated string, depending on the editor. */
function splitValues(value) {
  return Array.isArray(value) ? value : String(value ?? '').split(',');
}

/**
 * Builds the rule validator for a field. The query builder uses it to highlight invalid rules, and
 * validateReportQuery uses it to reject them before a report runs.
 *
 * - is null / is not null: valid without a value
 * - between / not between: exactly two filled, well-formed values
 * - in / not in: at least one value, all filled and well-formed
 * - everything else: one filled, well-formed value
 *
 * "Well-formed" depends on the field: digits for numbers, a real date/time for date, time and datetime
 * fields, true/false for checkboxes, any text otherwise.
 *
 * @param {{inputType?: string, valueEditorType?: string}} field  backend field definition
 * @returns {(rule: {operator: string, value: any}) => boolean}
 */
export function makeFieldValidator(field) {
  const isCheckbox = field.valueEditorType === 'checkbox';
  const check = VALUE_CHECKS[field.inputType];

  const isValidValue = (value) => {
    if (isCheckbox) {
      return value === true || value === false || value === 'true' || value === 'false';
    }
    if (!isFilled(value)) {
      return false;
    }
    return check ? check(String(value).trim()) : true;
  };

  return (rule) => {
    if (NO_VALUE_OPERATORS.has(rule.operator)) {
      return true;
    }
    if (TWO_VALUE_OPERATORS.has(rule.operator)) {
      const values = splitValues(rule.value);
      return values.length === 2 && values.every(isValidValue);
    }
    if (LIST_OPERATORS.has(rule.operator)) {
      const values = splitValues(rule.value);
      return values.length > 0 && values.every(isValidValue);
    }
    return isValidValue(rule.value);
  };
}

// Comparing values, and whether there is one
const COMPARISONS = ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull'];
const RANGES = ['between', 'notBetween'];
// What only ordered values (numbers, dates) take
const ORDERED_ONLY = ['>', '<', '<=', '>=', ...RANGES];

const operatorsNamed = (names) => arabicOperators.filter((operator) => names.includes(operator.name));

/** The operators a column's filter offers, by its type. */
function operatorsFor(field) {
  if (field.inputType === 'number') {
    return operatorsNamed(COMPARISONS);
  }
  if (field.inputType === 'date' || field.inputType === 'time') {
    return operatorsNamed([...COMPARISONS, ...RANGES]);
  }
  // No between for date-times: "between 2026-09-01T00:00 and 2026-09-30T00:00" looks like all of September but
  // drops everything after midnight on the 30th. Users combine >= and < instead.
  if (field.inputType === 'datetime-local') {
    return operatorsNamed(COMPARISONS);
  }
  if (field.valueEditorType === 'checkbox') {
    return operatorsNamed(['=']);
  }
  // Text: everything but the ordered comparisons
  return arabicOperators.filter((operator) => !ORDERED_ONLY.includes(operator.name));
}

/**
 * Turns the backend's report columns into query-builder fields: the operators that make sense for the
 * column's type, and a validator for the rule values (see makeFieldValidator).
 *
 * @param {Array<{name: string, label: string, inputType?: string, valueEditorType?: string}>} fields
 */
export function transformFields(fields) {
  return fields.map(field => toFullOption({
    ...field,
    operators: operatorsFor(field),
    validator: makeFieldValidator(field),
  }));
}

const COMBINATORS = new Set(['and', 'or']);

/**
 * Checks a query before it is turned into SQL, and returns the problems found (empty when the query is
 * safe to run).
 *
 * react-querybuilder copies field names, operators and combinators into the generated SQL as they are, and
 * its "diagnostics" format doesn't count unknown fields or wrong value types as invalid. A query sent to
 * the report route can be crafted by hand, so everything is checked against an allow-list here:
 * - every group's combinator is "and" or "or"
 * - every rule uses a known field, an operator allowed for that field, and a literal value
 *   (not valueSource "field", which would put another field name into the SQL)
 * - every rule's value passes the field's validator
 *
 * @param {object} query  react-querybuilder query
 * @param {Array<object>} fields  query-builder fields from transformFields
 * @returns {Array<{path: number[], message: string}>}
 */
export function validateReportQuery(query, fields) {
  const fieldsByName = new Map(fields.map(field => [field.name, field]));
  const problems = [];

  const visitRule = (rule, path) => {
    const field = fieldsByName.get(rule.field);
    if (!field) {
      problems.push({ path, message: `حقل غير معروف: ${String(rule.field)}` });
      return;
    }
    if (!field.operators.some(op => op.name === rule.operator)) {
      problems.push({ path, message: `العملية غير مسموحة للحقل ${field.label}: ${String(rule.operator)}` });
      return;
    }
    if (rule.valueSource !== undefined && rule.valueSource !== 'value') {
      problems.push({ path, message: `يُسمح بإدخال قيمة فقط للحقل ${field.label}` });
      return;
    }
    if (!field.validator(rule)) {
      problems.push({ path, message: `قيمة غير صحيحة للحقل ${field.label}` });
    }
  };

  const visitGroup = (group, path) => {
    if (!group || typeof group !== 'object' || !Array.isArray(group.rules)) {
      problems.push({ path, message: 'مجموعة غير صحيحة في الاستعلام' });
      return;
    }
    if (!COMBINATORS.has(group.combinator)) {
      problems.push({ path, message: `أداة ربط غير صحيحة: ${String(group.combinator)}` });
    }
    if (group.not !== undefined && typeof group.not !== 'boolean') {
      problems.push({ path, message: 'قيمة "ليس" غير صحيحة' });
    }
    group.rules.forEach((item, index) => {
      const itemPath = [...path, index];
      // Strings would be combinators between rules ("independent combinators"), which aren't used here
      if (!item || typeof item !== 'object') {
        problems.push({ path: itemPath, message: 'عنصر غير صحيح في الاستعلام' });
      } else if (Array.isArray(item.rules)) {
        visitGroup(item, itemPath);
      } else {
        visitRule(item, itemPath);
      }
    });
  };

  visitGroup(query, []);
  return problems;
}

/**
 * The error message for a query's problems, in Arabic like the rest of the UI. Used by the report
 * route's 400 response and by the report screen, so both say the same thing.
 *
 * @param {Array<{message: string}>} problems  from validateReportQuery
 * @returns {string}
 */
export function formatQueryProblems(problems) {
  return `استعلام التقرير غير صحيح: ${problems.map(problem => problem.message).join('، ')}`;
}

/**
 * Parses a JSON object kept in the URL (the report's query or its params). Anything else, including
 * unreadable JSON, gives the fallback.
 *
 * @param {string|undefined} text
 * @param {object} fallback
 * @returns {object}
 */
export function parseJsonObject(text, fallback) {
  if (!text) {
    return fallback;
  }
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** The directions a sort column may take, as the backend names them, with their labels. */
export const SORT_DIRECTIONS = Object.freeze([
  { value: 'asc', label: 'تصاعدي' },
  { value: 'desc', label: 'تنازلي' },
]);

/**
 * The total row of a report (its metadata's totals): each total column added up exactly over the rows given (those the
 * grid shows after its filters), leaving out the rows whose skipRowsWhere column is true, and the label in the label
 * column. Totals are plain decimal text, like the backend's numbers.
 *
 * @param {Array<object>} rows
 * @param {{label: string, labelColumn: string, columns: string[], skipRowsWhere?: string}} totals
 * @returns {object}
 */
export function totalsRow(rows, totals) {
  const countedRows = rows.filter((row) => !(totals.skipRowsWhere && row[totals.skipRowsWhere] === true));
  const total = { [totals.labelColumn]: totals.label };
  for (const column of totals.columns) {
    let sum = Big(0);
    for (const row of countedRows) {
      const value = row[column];
      if (value !== null && value !== undefined && value !== '') {
        sum = sum.add(Big(String(value)));
      }
    }
    total[column] = sum.stripTrailingZeros().toPlainString();
  }
  return total;
}

/**
 * Parses the sort kept in the URL: a JSON list of { column, direction }, most important column first. Anything
 * else, including unreadable JSON, gives no sort.
 *
 * @param {string|undefined} text
 * @returns {Array<{column: string, direction: string}>}
 */
export function parseReportSort(text) {
  if (!text) {
    return [];
  }
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * The sort to send, in its order: each entry on a column the report may be sorted by, once, with a known direction.
 * Entries left over from an older version of the report (a column that's gone) are dropped. A report with a fixed
 * order (its own orderBy) takes no sort at all.
 *
 * @param {Array<{column: string, direction: string}>} sort
 * @param {Array<{name: string, sortable?: boolean}>} columns  the report's columns (from its metadata)
 * @param {boolean} fixedOrder  the report's metadata fixedOrder
 * @returns {Array<{column: string, direction: string}>}
 */
export function selectReportSort(sort, columns, fixedOrder) {
  if (fixedOrder || !Array.isArray(sort)) {
    return [];
  }
  const sortableColumns = new Set(columns.filter((column) => column.sortable).map((column) => column.name));
  const knownDirections = new Set(SORT_DIRECTIONS.map((direction) => direction.value));
  const sortedColumns = new Set();
  const selected = [];
  for (const entry of sort) {
    const usable = entry && sortableColumns.has(entry.column) && !sortedColumns.has(entry.column)
      && knownDirections.has(entry.direction);
    if (usable) {
      sortedColumns.add(entry.column);
      selected.push({ column: entry.column, direction: entry.direction });
    }
  }
  return selected;
}

/**
 * The report's params 1 values to send: one entry per declared param (null when empty), so values left
 * over from an older version of the report are never sent.
 *
 * @param {Array<{fieldName: string}>} paramFields  the report's params (from its metadata)
 * @param {object} values  the values entered in the form, by field name
 * @returns {object}
 */
export function selectReportParams(paramFields, values) {
  return Object.fromEntries(paramFields.map(({ fieldName }) => {
    const value = values?.[fieldName];
    return [fieldName, value === undefined || value === '' ? null : value];
  }));
}

/**
 * Checks the params 1 values with the same rules as the CRUD forms (FormFields shows the result), and that no date is
 * before the date it may not be before (paramOrderProblem says why).
 *
 * @param {Array<{fieldName: string, validationType: string, validation?: string, required?: boolean,
 *   notBefore?: string}>} paramFields
 * @param {object} values
 * @returns {Object<string, boolean>} validity by field name
 */
export function validateReportParams(paramFields, values) {
  const selected = selectReportParams(paramFields, values);
  const tooEarly = new Set(datesBeforeTheirEarliest(paramFields, selected).map(({ fieldName }) => fieldName));
  return Object.fromEntries(paramFields.map(({ fieldName, validationType, validation, required }) => [
    fieldName,
    // Signed: a report may filter on a negative number
    validateFormField(validationType, !!required, validation, selected[fieldName], { signed: true })
      && !tooEarly.has(fieldName),
  ]));
}

/**
 * Why the params can't run, when a date is before the date it may not be before (its notBefore: a period ending
 * before it starts), as the backend would say it (REPORT_PARAM_BEFORE); null when none is.
 */
export function paramOrderProblem(paramFields, values) {
  const [first] = datesBeforeTheirEarliest(paramFields, selectReportParams(paramFields, values));
  if (!first) {
    return null;
  }
  const earliest = paramFields.find(({ fieldName }) => fieldName === first.notBefore);
  return errorMessageFromBody({
    errorCode: 'REPORT_PARAM_BEFORE',
    errorParams: { param: first.displayName, earliestParam: earliest.displayName },
  }, '');
}

/** The date params before their notBefore; a missing or invalid date isn't compared (its own check says so). */
function datesBeforeTheirEarliest(paramFields, selected) {
  const isDate = (value) => validateFormField('date', true, null, value);
  return paramFields.filter(({ fieldName, notBefore }) => notBefore
    && isDate(selected[fieldName]) && isDate(selected[notBefore])
    // YYYY-MM-DD: as text, in date order
    && selected[fieldName] < selected[notBefore]);
}

/**
 * The pages of documents a report may link to (a link's document, or a row's page in its documentColumn): the URL
 * parameter each takes its id in, and the title a row's page opens with when the row names it. The backend accepts
 * only these names as a link's document in report.json (SchemaNameValidator.DOCUMENT_PAGES).
 */
const DOCUMENT_PAGES = Object.freeze({
  'stock-adjustment': { idParam: 'adjustmentId', title: 'تسوية مخزون' },
  'opening-balance': { idParam: 'openingBalanceId', title: 'رصيد افتتاحي للمخزون' },
  'purchase-invoice': { idParam: 'invoiceId', title: 'فاتورة مشتريات' },
  'purchase-return': { idParam: 'returnId', title: 'مرتجع مشتريات' },
  'journal-entry': { idParam: 'entryId', title: 'قيد يومية' },
});

/** The document page's settings, or null for a name this frontend has no page for. */
function documentPage(name) {
  return typeof name === 'string' && Object.hasOwn(DOCUMENT_PAGES, name) ? DOCUMENT_PAGES[name] : null;
}

/**
 * What a linked report cell opens (the same URL the form itself uses), and the title of its window: a CRUD form
 * (link.schemaName), a document's page (link.document), or the document page the row names in link.documentColumn
 * (titled after that page). Null when the row has no id to open, or for a document this frontend has no page for.
 *
 * @param {{schemaName?: string, document?: string, documentColumn?: string, idColumn: string, formTitle?: string}}
 *   link  a column's link, from the report metadata
 * @param {object} row  the result row
 * @returns {{url: string, title: string}|null}
 */
export function linkTarget(link, row) {
  const id = row?.[link.idColumn];
  if (id === null || id === undefined || id === '') {
    return null;
  }
  const encodedId = encodeURIComponent(String(id));

  if (link.schemaName) {
    const url = `/dashboard/form?schemaName=${encodeURIComponent(link.schemaName)
      }&formTitle=${encodeURIComponent(link.formTitle)}&entityId=${encodedId}`;
    return { url, title: link.formTitle };
  }

  const pageName = link.document ?? row[link.documentColumn];
  const page = documentPage(pageName);
  if (!page) {
    return null;
  }
  const title = link.document ? link.formTitle : page.title;
  const url = `/dashboard/${pageName}?formTitle=${encodeURIComponent(title)}&${page.idParam}=${encodedId}`;
  return { url, title };
}
