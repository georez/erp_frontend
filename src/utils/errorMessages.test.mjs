// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_MESSAGES, errorMessageFromBody, placeholdersOf } from './errorMessages.js';
import { readErrorMessage } from './fetchJson.js';

/*
 * The backend's codes and the params each comes with: a copy of its ErrorCode enum
 * (backend/src/main/java/com/example/backend/errors/ErrorCode.java), where the backend refuses to send any other set.
 * Change both together when a code is added or its params change.
 */
const BACKEND_CODES = {
  UNKNOWN_FIELD: ['field'],
  FIELD_REQUIRED: ['field'],
  FIELD_INVALID: ['field'],
  FIELD_NUMBER_INVALID: ['field', 'integerDigits', 'decimals'],
  FIELD_TOO_LONG: ['field', 'maxLength'],
  FIELD_INVALID_CHOICE: ['field'],
  INVALID_ID: ['id'],
  RECORD_NOT_FOUND: ['id'],
  RECORD_IN_USE: ['id'],

  CONTRA_ACCOUNT_NOT_FOUND: ['accountId'],
  CONTRA_ACCOUNT_SIDE_NOT_ALLOWED: ['debitOrCredit'],
  PARENT_ACCOUNT_NOT_FOUND: ['accountId'],
  ACCOUNT_SIDE_DIFFERS_FROM_PARENT: ['debitOrCredit'],
  PARENT_ACCOUNT_NOT_NODE: ['accountId'],
  ACCOUNT_INVALID_COMBINATION: [],
  ACCOUNT_PARENT_CYCLE: [],
  ACCOUNT_WITH_LINES_CANT_BE_NODE: [],
  SEEDED_ACCOUNT_CANT_CHANGE: ['accountId'],

  TOO_MANY_LOGIN_ATTEMPTS: ['minutes'],
  SESSION_ENDED: [],

  REPORT_NOT_FOUND: ['report'],
  REPORT_PARAM_UNKNOWN: ['param'],
  REPORT_PARAM_REQUIRED: ['param'],
  REPORT_PARAM_TOO_LONG: ['param', 'maxLength'],
  REPORT_PARAM_INVALID_CHOICE: ['param'],
  REPORT_PARAM_INVALID: ['param'],

  ENTRY_REQUIRED: [],
  ENTRY_DESCRIPTION_TOO_LONG: ['maxLength'],
  DOCUMENT_TYPE_INVALID: ['maxLength'],
  DOCUMENT_ENTRY_CANT_BE_DATED: [],
  ENTRY_DATED_IN_FUTURE: [],
  LINE_EMPTY: ['line'],
  LINE_AMOUNT_MISSING: ['line'],
  LINE_AMOUNT_NEGATIVE: ['line'],
  LINE_NEEDS_ONE_SIDE: ['line'],
  LINE_TOO_MANY_DECIMALS: ['line', 'maxDecimals'],
  LINE_AMOUNT_TOO_LARGE: ['line'],
  LINE_DESCRIPTION_TOO_LONG: ['line', 'maxLength'],
  LINE_ACCOUNT_NOT_FOUND: ['line', 'accountId'],
  LINE_ACCOUNT_NOT_LEAF: ['line', 'accountId', 'accountName'],
  LINE_ACCOUNT_TAKES_NO_CUSTOMER: ['line', 'accountId', 'accountName'],
  LINE_ACCOUNT_NEEDS_STOCK_DOCUMENT: ['line', 'accountId', 'accountName'],
  LINE_NEEDS_CUSTOMER: ['line', 'accountId', 'accountName'],
  LINE_CUSTOMER_NOT_FOUND: ['line', 'customerId'],
  LINE_ACCOUNT_TAKES_NO_SUPPLIER: ['line', 'accountId', 'accountName'],
  LINE_NEEDS_SUPPLIER: ['line', 'accountId', 'accountName'],
  LINE_SUPPLIER_NOT_FOUND: ['line', 'supplierId'],
  ENTRY_NOT_FOUND: ['entryId'],
  ENTRY_NO_AMOUNTS: ['entryId'],
  ENTRY_NOT_BALANCED: ['entryId', 'debit', 'credit'],
  ENTRY_DOCUMENT_CANT_CHANGE: ['entryId'],
  ENTRY_POSTED: ['entryId'],
  ENTRY_DRAFT_CANT_BE_REVERSED: ['entryId'],
  ENTRY_ALREADY_REVERSED: ['entryId'],
  REVERSAL_BEFORE_ORIGINAL: ['entryId'],
  ENTRY_INVENTORY_NOT_MATCHING_STOCK: ['entryId'],
  ENTRY_MOVES_STOCK: ['entryId'],
  WAREHOUSE_NOT_FOUND: ['warehouseId'],
  STOCK_PRODUCT_NOT_FOUND: ['line', 'productId'],
  STOCK_QUANTITY_INVALID: ['line'],
  STOCK_INSUFFICIENT: ['line', 'productName', 'warehouseName', 'available'],
  STOCK_DOCUMENT_EMPTY: [],
  STOCK_BATCH_REQUIRED: ['line'],
  STOCK_BATCH_NUMBER_TOO_LONG: ['line', 'maxLength'],
  STOCK_BATCH_EXPIRY_REQUIRED: ['line', 'batchNumber'],
  STOCK_BATCH_EXPIRY_MISMATCH: ['line', 'batchNumber', 'expiryDate'],
  STOCK_BATCH_NOT_FOUND: ['line', 'productName', 'batchNumber'],
  STOCK_BATCH_INSUFFICIENT: ['line', 'productName', 'batchNumber', 'available'],
  WAREHOUSE_REQUIRED: [],
  STOCK_DESCRIPTION_TOO_LONG: ['maxLength'],
  STOCK_OFFSET_ACCOUNT_INVALID: ['accountId'],
  STOCK_ADJUSTMENT_NOT_FOUND: ['adjustmentId'],
  STOCK_ADJUSTMENT_POSTED: ['adjustmentId'],
  STOCK_ADJUSTMENT_LINE_NOT_FOUND: ['lineId'],
  PRODUCT_REQUIRED: [],
  PRODUCT_NOT_FOUND: ['productId'],
  COUNTED_QUANTITY_INVALID: [],
  DISCOUNT_INVALID: [],
  STOCK_DISCOUNT_REQUIRED: ['productName'],
  STOCK_LINE_VALUE_TOO_LARGE: ['productName'],
  STOCK_ADJUSTMENT_NO_DIFFERENCE: [],
  BATCH_NUMBER_REQUIRED: [],
  BATCH_NUMBER_TOO_LONG: ['maxLength'],
  BATCH_EXPIRY_REQUIRED: ['batchNumber'],
  BATCH_EXPIRY_MISMATCH: ['batchNumber', 'expiryDate'],
  SUPPLIER_REQUIRED: [],
  SUPPLIER_NOT_FOUND: ['supplierId'],
  SUPPLIER_INVOICE_NUMBER_TOO_LONG: ['maxLength'],
  SUPPLIER_INVOICE_DUPLICATE: ['supplierInvoiceNumber', 'invoiceId'],
  PURCHASE_INVOICE_NOT_FOUND: ['invoiceId'],
  PURCHASE_INVOICE_POSTED: ['invoiceId'],
  PURCHASE_INVOICE_LINE_NOT_FOUND: ['lineId'],
  QUANTITY_INVALID: [],
  BONUS_QUANTITY_INVALID: [],
  NOTHING_RECEIVED: [],
  PURCHASE_RETURN_NOT_FOUND: ['returnId'],
  PURCHASE_RETURN_POSTED: ['returnId'],
  PURCHASE_RETURN_LINE_NOT_FOUND: ['lineId'],
  PURCHASE_RETURN_INVOICE_INVALID: ['invoiceId'],
  PRODUCT_NOT_ON_INVOICE: ['productName'],
  PURCHASE_RETURN_EXCEEDS_INVOICE: ['productName', 'batchNumber', 'available'],
  RETURN_QUANTITY_INVALID: [],
  BATCH_NOT_FOUND: ['batchNumber'],
};

test('every backend code has a message, and no other code does', () => {
  assert.deepEqual(Object.keys(ERROR_MESSAGES).sort(), Object.keys(BACKEND_CODES).sort());
});

test('each message shows exactly the params its code comes with', () => {
  for (const [code, params] of Object.entries(BACKEND_CODES)) {
    assert.deepEqual([...new Set(placeholdersOf(ERROR_MESSAGES[code]))].sort(), [...params].sort(), code);
  }
});

test('a known code is shown in Arabic with its params', () => {
  assert.equal(
    errorMessageFromBody({
      errorCode: 'LINE_NEEDS_CUSTOMER',
      errorParams: { line: 2, accountId: 14, accountName: 'حسابات مدينة' },
      errorMessage: 'Line 2: account 14 (حسابات مدينة) needs a customer',
    }, 'fallback'),
    'السطر 2: حدّد العميل للحساب "حسابات مدينة" (رقم 14)');
});

test('a code without params still gets its message', () => {
  assert.equal(errorMessageFromBody({ errorCode: 'SESSION_ENDED' }, 'fallback'), 'انتهت الجلسة. سجّل الدخول مرة أخرى.');
});

test('a param the message needs but the body lacks gives the English message, not a broken one', () => {
  assert.equal(errorMessageFromBody({
    errorCode: 'LINE_NEEDS_CUSTOMER', errorParams: { line: 2 }, errorMessage: 'English',
  }, 'fallback'), 'English');
  assert.equal(errorMessageFromBody({ errorCode: 'RECORD_IN_USE', errorMessage: 'English' }, 'fallback'), 'English',
    'no errorParams at all');
});

test('without a known code, the English message is shown, else the fallback', () => {
  assert.equal(errorMessageFromBody({ errorMessage: 'Report query is not allowed' }, 'fallback'),
    'Report query is not allowed');
  assert.equal(errorMessageFromBody({ errorCode: 'ADDED_LATER', errorMessage: 'English' }, 'fallback'), 'English',
    'a code the frontend doesn\'t know yet');
  assert.equal(errorMessageFromBody({ errorCode: 'constructor', errorMessage: 'English' }, 'fallback'), 'English',
    'not a property of every object');
  assert.equal(errorMessageFromBody({}, 'fallback'), 'fallback');
  assert.equal(errorMessageFromBody(null, 'fallback'), 'fallback');
});

test('param values are shown as given, even ones that look like placeholders', () => {
  assert.equal(errorMessageFromBody({ errorCode: 'FIELD_REQUIRED', errorParams: { field: '{id} $&' } }, 'fallback'),
    'الحقل "{id} $&" مطلوب');
});

test('readErrorMessage reads the message from a failed response', async () => {
  const coded = Response.json({ errorCode: 'RECORD_IN_USE', errorParams: { id: '7' }, errorMessage: 'English' },
    { status: 409 });
  assert.equal(await readErrorMessage(coded), 'لا يمكن حذف السجل رقم 7 لأنه مستخدم في سجلات أخرى');

  const notJson = new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' });
  assert.equal(await readErrorMessage(notJson), 'Bad Gateway');
});
