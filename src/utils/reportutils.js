import { defaultOperators, toFullOption } from "react-querybuilder";
import { Big } from "bigdecimal.js";
import { validateFormField } from "./formValidation.js";

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

function operatorsFor(field) {
  if (field.inputType === 'number') {
    return arabicOperators.filter(op => ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull'].includes(op.name));
  }
  if (field.inputType === 'date' || field.inputType === 'time') {
    return arabicOperators.filter(op => ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull', 'between', 'notBetween'].includes(op.name));
  }
  // No between for date-times: "between 2026-09-01T00:00 and 2026-09-30T00:00" looks like all of September but
  // drops everything after midnight on the 30th. Users combine >= and < instead.
  if (field.inputType === 'datetime-local') {
    return arabicOperators.filter(op => ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull'].includes(op.name));
  }
  if (field.valueEditorType === 'checkbox') {
    return arabicOperators.filter(op => ['='].includes(op.name));
  }
  return arabicOperators.filter(op => !['>', '<', '<=', '>=', 'between', 'notBetween'].includes(op.name));
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
 * Checks the params 1 values with the same rules as the CRUD forms (FormFields shows the result).
 *
 * @param {Array<{fieldName: string, validationType: string, validation?: string, required?: boolean}>} paramFields
 * @param {object} values
 * @returns {Object<string, boolean>} validity by field name
 */
export function validateReportParams(paramFields, values) {
  const selected = selectReportParams(paramFields, values);
  return Object.fromEntries(paramFields.map(({ fieldName, validationType, validation, required }) => [
    fieldName,
    validateFormField(validationType, !!required, validation, selected[fieldName]),
  ]));
}

/**
 * The pages of documents a report may link to (a link's document), and the URL parameter each takes its id in.
 * The backend accepts only these names in report.json (SchemaNameValidator.DOCUMENT_PAGES).
 */
const DOCUMENT_PAGES = Object.freeze({
  'stock-adjustment': 'adjustmentId',
  'opening-balance': 'openingBalanceId',
  'purchase-invoice': 'invoiceId',
  'purchase-return': 'returnId',
});

/**
 * The dashboard URL that a linked report cell opens (the same URL the form itself uses): a CRUD form
 * (link.schemaName) or a document's page (link.document). Null when the row has no id to open, or for a document
 * this frontend has no page for.
 *
 * @param {{schemaName?: string, document?: string, idColumn: string, formTitle: string}} link  a column's link,
 *   from the report metadata
 * @param {object} row  the result row
 * @returns {string|null}
 */
export function buildLinkUrl(link, row) {
  const id = row?.[link.idColumn];
  if (id === null || id === undefined || id === '') {
    return null;
  }
  if (link.document) {
    const idParam = Object.hasOwn(DOCUMENT_PAGES, link.document) ? DOCUMENT_PAGES[link.document] : null;
    return idParam && `/dashboard/${link.document}?formTitle=${encodeURIComponent(link.formTitle)
      }&${idParam}=${encodeURIComponent(String(id))}`;
  }
  return `/dashboard/form?schemaName=${encodeURIComponent(link.schemaName)
    }&formTitle=${encodeURIComponent(link.formTitle)
    }&entityId=${encodeURIComponent(String(id))}`;
}

/**
 * Orders two report cells of a number column by value, exactly: the backend sends numeric and bigint values as
 * decimal text (a JavaScript number would lose digits) and the other numbers as JSON numbers, so the text must not
 * be compared as text ("10" before "9"). Empty cells come first, as the grid puts them.
 *
 * @param {string|number|null|undefined} a
 * @param {string|number|null|undefined} b
 * @returns {number} negative, zero or positive
 */
export function compareDecimalCells(a, b) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) {
    return aEmpty === bEmpty ? 0 : aEmpty ? -1 : 1;
  }
  return Big(a).compareTo(Big(b));
}

/**
 * A number cell as a JavaScript number, for the grid's own column filter, which only compares numbers: exact up to
 * about 15 significant digits. The query builder's filters run in the database and are exact. Null for an empty cell.
 */
export function cellFilterNumber(value) {
  return value === null || value === undefined || value === '' ? null : Number(value);
}
