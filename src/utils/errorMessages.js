/**
 * The messages users see for backend errors, in Arabic.
 *
 * An error the user can cause comes back as { errorCode, errorParams, errorMessage }: the code says what went wrong
 * and the params give the details (a field's label, a line number, an account's name). Each message below names the
 * params it shows as {placeholders}; they must be the params the backend declares for that code (its ErrorCode enum).
 * The two lists are kept in step by hand; errorMessages.test.mjs holds a copy of the backend's to check this file
 * against. Errors without a code, with a code this file doesn't know yet, or without a param their message needs are
 * shown with the backend's English errorMessage.
 */
export const ERROR_MESSAGES = Object.freeze({
  // --- forms ---
  UNKNOWN_FIELD: 'حقل غير معروف: {field}',
  FIELD_REQUIRED: 'الحقل "{field}" مطلوب',
  FIELD_INVALID: 'قيمة غير صحيحة في الحقل "{field}"',
  FIELD_NUMBER_INVALID:
    'رقم غير صحيح في الحقل "{field}" (الحد الأقصى {integerDigits} رقم قبل العلامة العشرية و{decimals} بعدها)',
  FIELD_VALUE_TAKEN: 'القيمة المدخلة في "{field}" موجودة في سجل آخر',
  FIELD_TOO_LONG: 'النص في الحقل "{field}" أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  FIELD_INVALID_CHOICE: 'اختيار غير صحيح في الحقل "{field}"',
  INVALID_ID: 'رقم سجل غير صحيح: {id}',
  RECORD_NOT_FOUND: 'السجل رقم {id} غير موجود',
  RECORD_IN_USE: 'لا يمكن حذف السجل رقم {id} لأنه مستخدم في سجلات أخرى',

  // --- accounts ---
  CONTRA_ACCOUNT_NOT_FOUND: 'الحساب المعكوس ضده رقم {accountId} غير موجود',
  CONTRA_ACCOUNT_SIDE_NOT_ALLOWED: 'الحساب المعاكس يكون عكس طبيعة الحساب المعكوس ضده، فلا يمكن أن يكون "{debitOrCredit}"',
  PARENT_ACCOUNT_NOT_FOUND: 'الحساب الأم رقم {accountId} غير موجود أو لا يمكن اختياره كحساب أم',
  ACCOUNT_SIDE_DIFFERS_FROM_PARENT: 'طبيعة الحساب تكون مثل طبيعة الحساب الأم، فلا يمكن أن تكون "{debitOrCredit}"',
  PARENT_ACCOUNT_NOT_NODE: 'الحساب الأم رقم {accountId} يجب أن يكون حساباً رئيسياً (NODE)',
  ACCOUNT_INVALID_COMBINATION: 'بيانات الحساب غير متوافقة: راجع الحساب الأم والحساب المعاكس ونوع الحساب (NODE/LEAF)',
  ACCOUNT_PARENT_CYCLE: 'لا يمكن أن يكون الحساب الأم هو الحساب نفسه أو أحد حساباته الفرعية',
  ACCOUNT_WITH_LINES_CANT_BE_NODE: 'على هذا الحساب قيود، فلا يمكن تحويله إلى حساب رئيسي (NODE)',
  SEEDED_ACCOUNT_CANT_CHANGE: 'الحساب رقم {accountId} من الحسابات الأساسية للنظام ولا يمكن تعديله أو حذفه',

  // --- login ---
  TOO_MANY_LOGIN_ATTEMPTS: 'محاولات دخول فاشلة كثيرة. حاول مرة أخرى بعد {minutes} دقيقة.',
  SESSION_ENDED: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',

  // --- report params ---
  REPORT_NOT_FOUND: 'التقرير "{report}" غير موجود',
  REPORT_PARAM_UNKNOWN: 'معيار غير معروف في التقرير: {param}',
  REPORT_PARAM_REQUIRED: 'المعيار "{param}" مطلوب',
  REPORT_PARAM_TOO_LONG: 'النص في المعيار "{param}" أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  REPORT_PARAM_INVALID_CHOICE: 'اختيار غير صحيح في المعيار "{param}"',
  REPORT_PARAM_INVALID: 'قيمة غير صحيحة في المعيار "{param}"',

  // --- ledger ---
  ENTRY_REQUIRED: 'بيانات القيد مطلوبة',
  ENTRY_DESCRIPTION_TOO_LONG: 'بيان القيد أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  DOCUMENT_TYPE_INVALID: 'نوع المستند غير صحيح (الحد الأقصى {maxLength} حرف)',
  DOCUMENT_ENTRY_CANT_BE_DATED: 'قيد المستند يسري من لحظة ترحيله، فلا يمكن تحديد تاريخ له',
  ENTRY_DATED_IN_FUTURE: 'لا يمكن أن يكون تاريخ القيد في المستقبل',
  LINE_EMPTY: 'السطر {line} فارغ',
  LINE_AMOUNT_MISSING: 'السطر {line}: أدخل المدين والدائن (أحدهما صفر)',
  LINE_AMOUNT_NEGATIVE: 'السطر {line}: لا يمكن أن يكون المبلغ سالباً',
  LINE_NEEDS_ONE_SIDE: 'السطر {line}: يكون المبلغ في جانب واحد فقط، مدين أو دائن',
  LINE_TOO_MANY_DECIMALS: 'السطر {line}: المبلغ به أرقام عشرية أكثر من المسموح (الحد الأقصى {maxDecimals})',
  LINE_AMOUNT_TOO_LARGE: 'السطر {line}: المبلغ أكبر من المسموح',
  LINE_DESCRIPTION_TOO_LONG: 'السطر {line}: البيان أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  LINE_ACCOUNT_NOT_FOUND: 'السطر {line}: الحساب رقم {accountId} غير موجود',
  LINE_ACCOUNT_NOT_LEAF:
    'السطر {line}: الحساب "{accountName}" (رقم {accountId}) حساب رئيسي، والترحيل يكون على الحسابات الفرعية فقط',
  LINE_ACCOUNT_TAKES_NO_CUSTOMER: 'السطر {line}: الحساب "{accountName}" (رقم {accountId}) لا يُحدَّد له عميل',
  LINE_ACCOUNT_NEEDS_STOCK_DOCUMENT:
    'السطر {line}: الحساب "{accountName}" (رقم {accountId}) لا يُرحَّل عليه إلا من مستندات المخزون',
  LINE_NEEDS_CUSTOMER: 'السطر {line}: حدّد العميل للحساب "{accountName}" (رقم {accountId})',
  LINE_CUSTOMER_NOT_FOUND: 'السطر {line}: العميل رقم {customerId} غير موجود',
  LINE_ACCOUNT_TAKES_NO_SUPPLIER: 'السطر {line}: الحساب "{accountName}" (رقم {accountId}) لا يُحدَّد له مورد',
  LINE_NEEDS_SUPPLIER: 'السطر {line}: حدّد المورد للحساب "{accountName}" (رقم {accountId})',
  LINE_SUPPLIER_NOT_FOUND: 'السطر {line}: المورد رقم {supplierId} غير موجود',
  ENTRY_NOT_FOUND: 'القيد رقم {entryId} غير موجود',
  ENTRY_NO_AMOUNTS: 'القيد رقم {entryId} ليس به مبالغ',
  ENTRY_NOT_BALANCED: 'القيد رقم {entryId} غير متوازن: المدين {debit} والدائن {credit}',
  ENTRY_DOCUMENT_CANT_CHANGE: 'لا يمكن تغيير المستند المرتبط بالقيد رقم {entryId}',
  ENTRY_POSTED: 'القيد رقم {entryId} مُرحَّل ولا يمكن تعديله أو حذفه؛ ألغِه بقيد عكسي',
  ENTRY_DRAFT_CANT_BE_REVERSED: 'القيد رقم {entryId} مسودة؛ عدّله أو احذفه بدلاً من عكسه',
  ENTRY_ALREADY_REVERSED: 'القيد رقم {entryId} تم عكسه من قبل',
  REVERSAL_BEFORE_ORIGINAL: 'لا يمكن أن يكون تاريخ القيد العكسي قبل تاريخ القيد رقم {entryId}',
  ENTRY_INVENTORY_NOT_MATCHING_STOCK: 'مبالغ حساب المخزون في القيد رقم {entryId} لا تساوي قيمة حركات المخزون',
  ENTRY_MOVES_STOCK: 'القيد رقم {entryId} به حركات مخزون، فلا يُعكَس؛ صحّحه بمستند مخزون آخر',

  // --- stock ---
  WAREHOUSE_NOT_FOUND: 'المخزن رقم {warehouseId} غير موجود',
  STOCK_PRODUCT_NOT_FOUND: 'السطر {line}: الصنف رقم {productId} غير موجود',
  STOCK_QUANTITY_INVALID: 'السطر {line}: الكمية غير صحيحة (عدد صحيح من الوحدات لا يساوي صفراً)',
  STOCK_INSUFFICIENT: 'السطر {line}: الرصيد غير كافٍ من "{productName}" في "{warehouseName}" (المتاح {available})',
  STOCK_DOCUMENT_EMPTY: 'المستند ليس به أسطر',
  STOCK_BATCH_NOT_FOUND: 'السطر {line}: لا توجد تشغيلة "{batchNumber}" للصنف "{productName}"',
  STOCK_BATCH_INSUFFICIENT: 'السطر {line}: رصيد التشغيلة "{batchNumber}" من "{productName}" غير كافٍ (المتاح {available})',

  // --- stock documents, alike ---
  WAREHOUSE_REQUIRED: 'حدّد المخزن',
  SUPPLIER_REQUIRED: 'حدّد المورد',
  SUPPLIER_NOT_FOUND: 'المورد رقم {supplierId} غير موجود',
  STOCK_DESCRIPTION_TOO_LONG: 'البيان أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  PRODUCT_REQUIRED: 'حدّد الصنف',
  PRODUCT_NOT_FOUND: 'الصنف رقم {productId} غير موجود',
  QUANTITY_INVALID: 'الكمية غير صحيحة (عدد صحيح من الوحدات، واحد أو أكثر)',
  DISCOUNT_INVALID: 'نسبة الخصم غير صحيحة (من 0 إلى 100، والحد الأقصى 3 أرقام عشرية)',
  DISCOUNT_REQUIRED: 'أدخل نسبة الخصم',
  STOCK_LINE_VALUE_TOO_LARGE: 'قيمة سطر "{productName}" أكبر من المسموح',
  BATCH_NUMBER_REQUIRED: 'أدخل رقم التشغيلة',
  BATCH_NUMBER_TOO_LONG: 'رقم التشغيلة أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  BATCH_EXPIRY_REQUIRED: 'أدخل تاريخ صلاحية التشغيلة',

  // --- stock adjustments ---
  STOCK_ADJUSTMENT_NOT_FOUND: 'تسوية المخزون رقم {adjustmentId} غير موجودة',
  STOCK_ADJUSTMENT_POSTED: 'تسوية المخزون رقم {adjustmentId} مُرحَّلة ولا يمكن تعديلها؛ صحّحها بتسوية أخرى',
  STOCK_ADJUSTMENT_LINE_NOT_FOUND: 'السطر رقم {lineId} غير موجود في التسوية',
  COUNTED_QUANTITY_INVALID: 'الكمية الفعلية غير صحيحة (عدد صحيح من الوحدات، صفر أو أكثر)',
  STOCK_DISCOUNT_REQUIRED: 'الكمية الفعلية من "{productName}" صارت أكبر من الرصيد: أدخل نسبة الخصم في سطره',
  STOCK_ADJUSTMENT_NO_DIFFERENCE: 'كل الكميات الفعلية تساوي الرصيد، فلا يوجد ما يُرحَّل',

  // --- opening balances ---
  OPENING_BALANCE_NOT_FOUND: 'الرصيد الافتتاحي رقم {openingBalanceId} غير موجود',
  OPENING_BALANCE_POSTED: 'الرصيد الافتتاحي رقم {openingBalanceId} مُرحَّل ولا يمكن تعديله؛ صحّحه بتسوية مخزون',
  OPENING_BALANCE_PRODUCT_HAS_MOVED:
    'للصنف "{productName}" حركات في "{warehouseName}" بالفعل، فلا يُدخَل له رصيد افتتاحي فيه؛ صحّح رصيده بتسوية مخزون',
  OPENING_BALANCE_LINE_NOT_FOUND: 'السطر رقم {lineId} غير موجود في الرصيد الافتتاحي',

  // --- purchase invoices ---
  SUPPLIER_INVOICE_NUMBER_TOO_LONG: 'رقم فاتورة المورد أطول من المسموح (الحد الأقصى {maxLength} حرف)',
  PURCHASE_INVOICE_NOT_FOUND: 'فاتورة المشتريات رقم {invoiceId} غير موجودة',
  PURCHASE_INVOICE_POSTED: 'فاتورة المشتريات رقم {invoiceId} مُرحَّلة ولا يمكن تعديلها؛ صحّحها بمرتجع مشتريات',
  PURCHASE_INVOICE_LINE_NOT_FOUND: 'السطر رقم {lineId} غير موجود في الفاتورة',
  PURCHASE_INVOICE_BATCHES_NOT_STARTED: 'أدخل أصناف الفاتورة رقم {invoiceId} أولاً، ثم انتقل إلى إدخال التشغيلات',
  PURCHASE_INVOICE_BATCH_NOT_FOUND: 'التشغيلة رقم {batchId} غير موجودة في الفاتورة',
  PURCHASE_INVOICE_BATCHES_INCOMPLETE: 'تشغيلات "{productName}" مجموعها {batched} والكمية {quantity}: يجب أن يتساويا',

  // --- purchase returns ---
  PURCHASE_RETURN_NOT_FOUND: 'مرتجع المشتريات رقم {returnId} غير موجود',
  PURCHASE_RETURN_POSTED: 'مرتجع المشتريات رقم {returnId} مُرحَّل ولا يمكن تعديله',
  PURCHASE_RETURN_LINE_NOT_FOUND: 'السطر رقم {lineId} غير موجود في المرتجع',
  PURCHASE_RETURN_INVOICE_INVALID: 'فاتورة المشتريات رقم {invoiceId} ليست فاتورة مُرحَّلة لهذا المورد',
  PRODUCT_NOT_ON_INVOICE: 'الصنف "{productName}" ليس في فاتورة المشتريات',
  PURCHASE_RETURN_EXCEEDS_STOCK:
    'لا يوجد في المخزن من "{productName}" (التشغيلة "{batchNumber}") إلا {available}: لا يمكن إرجاع أكثر من ذلك',
  PURCHASE_RETURN_EXCEEDS_INVOICE:
    'لا يمكن إرجاع أكثر من {available} من "{productName}" (التشغيلة "{batchNumber}") من هذه الفاتورة',
  BATCH_NOT_FOUND: 'التشغيلة "{batchNumber}" غير موجودة',
});

const PLACEHOLDER = /\{(\w+)\}/g;

/** The names of the {placeholders} in a message, in order. */
export function placeholdersOf(message) {
  return [...message.matchAll(PLACEHOLDER)].map(match => match[1]);
}

/**
 * The message to show for a backend error body: the Arabic message for its errorCode with its params filled in;
 * else (no code, an unknown code, or a param the message needs is missing) its errorMessage; else the fallback.
 *
 * @param {{errorCode?: string, errorParams?: object, errorMessage?: string} | null} body  the error response's JSON
 * @param {string} fallback  for a body without either, e.g. a proxy's error page
 * @returns {string}
 */
export function errorMessageFromBody(body, fallback) {
  const code = body?.errorCode;
  // Object.hasOwn: a code like "constructor" must not find Object.prototype's
  if (typeof code === 'string' && Object.hasOwn(ERROR_MESSAGES, code)) {
    const message = ERROR_MESSAGES[code];
    const params = body.errorParams ?? {};
    if (placeholdersOf(message).every(name => params[name] !== undefined && params[name] !== null)) {
      return message.replace(PLACEHOLDER, (_, name) => String(params[name]));
    }
  }
  return body?.errorMessage || fallback;
}
