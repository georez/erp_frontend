import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

// Without this plugin dayjs ignores the format and strict flag, so "2026-02-30" parses as 2 March. The date
// pickers' adapter also loads it, but only once a picker has rendered, so validation can't rely on that.
dayjs.extend(customParseFormat);

function getDateTimeFormat(fieldType) {
  let format;
  switch (fieldType) {
    case "date":
      format = "YYYY-MM-DD";
      break;
    case "time":
      format = "HH:mm:ss";
      break;
    case "datetime":
      format = "YYYY-MM-DDTHH:mm:ss";
      break;
    default:
      throw new Error(
        "Illegal state exception: unknown validation type " + fieldType
      );
  }
  return format;
}

export function createDateTime(fieldType, value) {
  return dayjs(value, getDateTimeFormat(fieldType), true);
}

export function formatDateTime(fieldType, value) {
  return dayjs(value).format(getDateTimeFormat(fieldType));
}

/**
 * Whether a form field's value is valid, as the backend checks it (SchemaCrudService, ReportParamConverter): a text is
 * trimmed first, one of spaces being no value. A number is not negative unless signed (a report's param may be; no
 * form's number is, a price or a VAT rate).
 */
export function validateFormField(validationType, fieldRequired, validation, value, { signed = false } = {}) {
  if (typeof value === 'string') {
    value = value.trim();
  }
  if (value === null || value === undefined || value === '') {
    return !fieldRequired;
  }

  if (validationType === "id") {
    if (typeof value !== 'string') {
      return false;
    }

    return /^(0|([1-9][0-9]*))$/.test(value);
  } else if (validationType === "number") {
    if (typeof value !== 'string') {
      return false;
    }
    const precisionAndScale = validation.split(',');
    const precision = Number(precisionAndScale[0]);
    const scale = Number(precisionAndScale[1]);

    if (precision < 1 || scale < 0 || scale > precision) {
      throw new Error("Invalid precision or scale bounds.");
    }
    const maxIntegerDigits = precision - scale;
    const sign = signed ? '-?' : '';
    let pattern;
    if (scale === 0) {
      // Integer only: e.g. NUMERIC(5,0) -> max 5 digits
      pattern = `^${sign}\\d{1,${maxIntegerDigits}}$`;
    } else if (maxIntegerDigits === 0) {
      // Scale equals precision: e.g. NUMERIC(2,2) -> max 0 integer digits (0.12 or .12)
      pattern = `^${sign}0\\.\\d{1,${scale}}$`;
    } else {
      // Standard case: e.g. NUMERIC(5,2) -> max 3 integer digits, max 2 decimal digits
      pattern = `^${sign}\\d{1,${maxIntegerDigits}}(\\.\\d{1,${scale}})?$`;
    }

    return (new RegExp(pattern)).test(value);
  } else if (validationType === "string") {
    if (typeof value !== 'string') {
      return false;
    }
    const maxCharNumber = validation;
    return (new RegExp(`^.{1,${maxCharNumber}}$`)).test(value);
  } else if (validationType === "link") {
    if (typeof value !== 'string') {
      return false;
    }

    return /^(0|([1-9][0-9]*))$/.test(value);
  } else if (
    validationType === 'datetime' ||
    validationType === 'date' ||
    validationType === 'time'
  ) {
    if (typeof value !== 'string') {
      return false;
    }

    return dayjs(value, getDateTimeFormat(validationType), true).isValid();
  } else if (validationType === "choices") {
    if (typeof value !== 'string') {
      return false;
    }

    return true;
  } else if (validationType === "boolean") {
    if (typeof value !== 'boolean') {
      return false;
    }

    return true;
  }

  return false;
}