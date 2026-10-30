import { normalizeDecimalText } from './decimals.js';

/*
 * Expiry dates as they're typed: a box shows its batch's month and year ("05/2027"), which means the first day of
 * that month, or a whole date ("15/05/2027"). Day first, month, then year; the parts separated by "/", "-", "." or a
 * space; a two-digit year is in the 2000s. Also the year first ("2027-05", "2027-05-15"), as dates come back from
 * the backend.
 */

const SEPARATORS = /[\s/.-]+/;

/** ISO date text (yyyy-mm-dd) of the date, if it exists (no 31/04, no 29/02 outside leap years); else null. */
function isoDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const yearOf = (text) => (text.length === 2 ? 2000 + Number(text) : text.length === 4 ? Number(text) : NaN);

/**
 * The expiry date written in the text, as ISO date text (yyyy-mm-dd): a month and year mean the month's first day.
 * Null for anything else, or a date that doesn't exist.
 */
export function parseExpiry(text) {
  const parts = normalizeDecimalText(text).split(SEPARATORS).filter(Boolean);
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) {
    return null;
  }
  if (parts[0].length === 4) {
    // Year first: yyyy-mm or yyyy-mm-dd
    const [year, month, day = '1'] = parts;
    return month.length <= 2 && day.length <= 2 ? isoDate(Number(year), Number(month), Number(day)) : null;
  }
  const [day, month, year] = parts.length === 3 ? parts : ['1', ...parts];
  if (day.length > 2 || month.length > 2) {
    return null;
  }
  return isoDate(yearOf(year), Number(month), Number(day));
}

/** An ISO date (yyyy-mm-dd) as it's shown: dd/mm/yyyy; empty for none. */
export function formatExpiry(isoText) {
  if (!isoText) {
    return '';
  }
  const [year, month, day] = isoText.split('-');
  return `${day}/${month}/${year}`;
}
