import { Big, RoundingMode } from 'bigdecimal.js';

/**
 * Exact decimal numbers for quantities and money, with bigdecimal.js: a JavaScript number can't hold 0.1 exactly
 * and loses digits past about 15, so amounts are kept as text or BigDecimal and never become numbers.
 *
 * Quantities are whole units, numeric(18, 0) in the backend: up to 18 digits.
 */
const MAX_INTEGER_DIGITS = 18;

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;
// Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits, as an Arabic keyboard types them
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/**
 * The text as the backend accepts it: trimmed, Arabic digits and the Arabic decimal separator (٫) turned into
 * ASCII. Doesn't check that it's a number. Thousands separators aren't removed: "1,5" may mean 1.5, so it's
 * refused rather than read as 15.
 */
export function normalizeDecimalText(text) {
  return String(text ?? '')
    .trim()
    .replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(/٫/g, '.');
}

/** The number written in the text (see normalizeDecimalText), or null if it isn't one. "1e5" and "" aren't. */
export function parseDecimal(text) {
  const normalized = normalizeDecimalText(text);
  return DECIMAL_TEXT.test(normalized) ? Big(normalized) : null;
}

/** Plain text without trailing zeros or an exponent, with thousands separators: 1234.5000000 → "1,234.5". */
export function formatDecimal(value) {
  const plain = value.stripTrailingZeros().toPlainString();
  const [integer, fraction] = plain.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/**
 * A report cell's amount (decimal text, or a JSON number for small integers) rounded half up to two decimals, with
 * thousands separators: "1234.565" → "1,234.57", "7" → "7.00". Empty for an empty cell; anything that isn't a number
 * is shown as it is.
 */
export function formatAmount(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const text = String(value);
  if (!DECIMAL_TEXT.test(text)) {
    return text;
  }
  const rounded = Big(text).setScale(2, RoundingMode.HALF_UP).toPlainString();
  const [integer, fraction] = rounded.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/**
 * An amount (decimal text) exactly, with every decimal it has but never fewer than two, and thousands separators:
 * "1652.9135000" → "1,652.9135", "850" → "850.00", "0.0036" → "0.0036".
 */
export function formatExactAmount(value) {
  const number = Big(value);
  const decimals = Math.max(number.stripTrailingZeros().scale(), 2);
  const [integer, fraction] = number.setScale(decimals).toPlainString().split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

const WHOLE_NUMBER = /^\d+$/;

/**
 * A count of whole units (the products are pharmaceuticals: boxes, strips...): the normalized text of a whole number,
 * zero or more and at most 18 digits (the backend's numeric(18, 0)), or null.
 */
export function parseWholeUnits(text) {
  const normalized = normalizeDecimalText(text).replace(/^0+(?=\d)/, '');
  return WHOLE_NUMBER.test(normalized) && normalized.length <= MAX_INTEGER_DIGITS ? normalized : null;
}

export const MAX_PERCENT_DECIMALS = 3;

/** A percent from 0 to 100 with at most 3 decimals (a discount), or null. */
export function parsePercent(text) {
  const value = parseDecimal(text);
  if (!value || value.signum() < 0 || value.compareTo(Big(100)) > 0) {
    return null;
  }
  return Math.max(value.stripTrailingZeros().scale(), 0) <= MAX_PERCENT_DECIMALS ? value : null;
}
