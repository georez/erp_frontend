import { Big } from 'bigdecimal.js';
import { normalizeDecimalText, parsePercent, parseWholeUnits } from '@/utils/decimals';
import { parseExpiry } from '@/utils/expiryDates';

/*
 * The checks of what's typed into a document form, before it's sent to the backend (which checks it again). Each
 * check of an entry row's field takes the text as typed and returns either the value to send, as text (so no number
 * passes through a JavaScript number), or { error }: the message to show under the field.
 */

// The documents' description columns are varchar(500); batches.batch_number is varchar(50)
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_BATCH_NUMBER_LENGTH = 50;

export const REQUIRED = 'مطلوب';
export const DISCOUNT_ERROR = 'من 0 إلى 100، حتى 3 أرقام عشرية';
const INVALID_DATE = 'تاريخ غير صحيح';

const isBlank = (text) => text.trim() === '';

/**
 * What a new document's header lacks for its first line to be sent, or null: the supplier (when the document has one)
 * and the warehouse chosen, and the description short enough.
 */
export function headerProblem(header, { needsSupplier = false } = {}) {
  if (needsSupplier && header.supplierId == null) {
    return 'حدّد المورد أولاً';
  }
  if (header.warehouseId == null) {
    return 'حدّد المخزن أولاً';
  }
  if (header.description.length > MAX_DESCRIPTION_LENGTH) {
    return `البيان أطول من المسموح (الحد الأقصى ${MAX_DESCRIPTION_LENGTH} حرف)`;
  }
  return null;
}

/** The error for a product that must be chosen, or null. */
export function missingProduct(productId) {
  return productId == null ? 'حدّد الصنف' : null;
}

/** A quantity of at least one whole unit: { quantity } or { error }. */
export function checkQuantity(text) {
  if (isBlank(text)) {
    return { error: REQUIRED };
  }
  const quantity = parseWholeUnits(text);
  if (quantity == null || Big(quantity).signum() <= 0) {
    return { error: 'عدد صحيح أكبر من صفر' };
  }
  return { quantity };
}

/** A counted quantity: zero or more whole units. { quantity } or { error }. */
export function checkCountedQuantity(text) {
  if (isBlank(text)) {
    return { error: REQUIRED };
  }
  const quantity = parseWholeUnits(text);
  return quantity == null ? { error: 'عدد صحيح من الوحدات' } : { quantity };
}

/** A discount that may be left empty: { discount } (null for none) or { error }. */
export function checkOptionalDiscount(text) {
  if (isBlank(text)) {
    return { discount: null };
  }
  return parsePercent(text) ? { discount: normalizeDecimalText(text) } : { error: DISCOUNT_ERROR };
}

/** A discount that must be given: { discount } or { error }. */
export function checkRequiredDiscount(text) {
  if (isBlank(text)) {
    return { error: REQUIRED };
  }
  return checkOptionalDiscount(text);
}

/** A batch number: { number } (trimmed, upper case, as the backend keeps it) or { error }. */
export function checkBatchNumber(text) {
  const number = text.trim().toUpperCase();
  if (number === '') {
    return { error: REQUIRED };
  }
  if (number.length > MAX_BATCH_NUMBER_LENGTH) {
    return { error: `الحد الأقصى ${MAX_BATCH_NUMBER_LENGTH} حرف` };
  }
  return { number };
}

/** An expiry date as typed (utils/expiryDates): { date } (ISO) or { error }. */
export function checkExpiry(text) {
  if (isBlank(text)) {
    return { error: REQUIRED };
  }
  const date = parseExpiry(text);
  return date ? { date } : { error: INVALID_DATE };
}

/** Whether an expiry date typed is one that can't be read (an empty one isn't). */
export function isUnreadableExpiry(text) {
  return !isBlank(text) && parseExpiry(text) == null;
}

/** Whether any of the errors (by field) is set. */
export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}
