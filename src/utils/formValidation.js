import dayjs from "dayjs";

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

export function validateFormField(validationType, fieldRequired, validation, value) {
  if (!fieldRequired && (value === null || value === '')) {
    return true;
  }

  if (fieldRequired && !value) {
    return false;
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
    let pattern;
    if (scale === 0) {
      // Integer only: e.g. NUMERIC(5,0) -> max 5 digits
      pattern = `^-?\\d{1,${maxIntegerDigits}}$`;
    } else if (maxIntegerDigits === 0) {
      // Scale equals precision: e.g. NUMERIC(2,2) -> max 0 integer digits (0.12 or .12)
      pattern = `^-?0?\\.\\d{1,${scale}}$`;
    } else {
      // Standard case: e.g. NUMERIC(5,2) -> max 3 integer digits, max 2 decimal digits
      pattern = `^-?\\d{1,${maxIntegerDigits}}(\\.\\d{1,${scale}})?$`;
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
  }

  return false;
}