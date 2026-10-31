import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

// Without this plugin dayjs ignores the format and strict flag, so "2026-02-30" parses as 2 March. The date
// pickers' adapter also loads it, but only once a picker has rendered, so validation can't rely on that.
dayjs.extend(customParseFormat);

/** How each date/time field type is written, as the backend sends and takes it. */
const DATE_TIME_FORMATS = {
  date: "YYYY-MM-DD",
  time: "HH:mm:ss",
  datetime: "YYYY-MM-DDTHH:mm:ss",
};

function getDateTimeFormat(fieldType) {
  const format = DATE_TIME_FORMATS[fieldType];
  if (!format) {
    throw new Error("Illegal state exception: unknown validation type " + fieldType);
  }
  return format;
}

export function createDateTime(fieldType, value) {
  return dayjs(value, getDateTimeFormat(fieldType), true);
}

export function formatDateTime(fieldType, value) {
  return dayjs(value).format(getDateTimeFormat(fieldType));
}

const WHOLE_NUMBER = /^(0|([1-9][0-9]*))$/;

/**
 * A pattern for a number of a column's precision and scale (e.g. NUMERIC(5,2): at most 3 digits before the decimal
 * point and 2 after), with a minus sign allowed if signed. The same as the backend's Decimals.pattern.
 */
function numberPattern(validation, signed) {
  const [precision, scale] = validation.split(',').map(Number);
  if (precision < 1 || scale < 0 || scale > precision) {
    throw new Error("Invalid precision or scale bounds.");
  }
  const maxIntegerDigits = precision - scale;
  const sign = signed ? '-?' : '';
  if (scale === 0) {
    // Integer only: e.g. NUMERIC(5,0) -> max 5 digits
    return new RegExp(`^${sign}\\d{1,${maxIntegerDigits}}$`);
  }
  if (maxIntegerDigits === 0) {
    // Scale equals precision: e.g. NUMERIC(2,2) -> max 0 integer digits (0.12)
    return new RegExp(`^${sign}0\\.\\d{1,${scale}}$`);
  }
  // Standard case: e.g. NUMERIC(5,2) -> max 3 integer digits, max 2 decimal digits
  return new RegExp(`^${sign}\\d{1,${maxIntegerDigits}}(\\.\\d{1,${scale}})?$`);
}

const isText = (value) => typeof value === 'string';

/** The check of a value (not empty) for each validationType; `validation` is the type's detail from the metadata. */
const VALUE_CHECKS = {
  id: (value) => isText(value) && WHOLE_NUMBER.test(value),
  link: (value) => isText(value) && WHOLE_NUMBER.test(value),
  // validation: "precision,scale"
  number: (value, validation, signed) => isText(value) && numberPattern(validation, signed).test(value),
  // validation: the maximum length
  string: (value, validation) => isText(value) && new RegExp(`^.{1,${validation}}$`).test(value),
  date: (value) => isText(value) && dayjs(value, getDateTimeFormat('date'), true).isValid(),
  time: (value) => isText(value) && dayjs(value, getDateTimeFormat('time'), true).isValid(),
  datetime: (value) => isText(value) && dayjs(value, getDateTimeFormat('datetime'), true).isValid(),
  choices: (value) => isText(value),
  boolean: (value) => typeof value === 'boolean',
};

/**
 * Whether a form field's value is valid, as the backend checks it (SchemaCrudService, ReportParamConverter): a text is
 * trimmed first, one of spaces being no value. A number is not negative unless signed (a report's param may be; no
 * form's number is, a price or a VAT rate). A type this doesn't know is never valid.
 */
export function validateFormField(validationType, fieldRequired, validation, value, { signed = false } = {}) {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === null || trimmed === undefined || trimmed === '') {
    return !fieldRequired;
  }
  const check = VALUE_CHECKS[validationType];
  return check ? check(trimmed, validation, signed) : false;
}
