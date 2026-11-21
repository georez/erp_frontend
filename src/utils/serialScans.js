/*
 * Which of a document's serial rows (SerialsSection's) a scanned pack goes on: a row of a product with the pack's
 * GTIN; when the rows are batches, the one of the pack's lot (upper case, as batches keep it) and expiry month (a month
 * is entered as its first day, and a pack may carry the month's last); and one that takes more serials. A receiving
 * document makes the row itself (scannedProduct only picks the product).
 */

/** Whether two ISO dates are in the same month; true when either is unknown. */
const sameMonth = (first, second) => !first || !second || first.slice(0, 7) === second.slice(0, 7);

/**
 * The row the scan goes on: { row }; { rows } when several may (to choose from); { error } when none.
 *
 * @param {Array<object>} rows       { rowId, productId, productName, batchNumber?, expiryDate?, quantity, limit?,
 *                                   serials }
 * @param {Array<number>} productIds the products with the pack's GTIN
 * @param {{batchNumber: string|null, expiryDate: string|null}} scan
 * @param {function(object): boolean} isFull  whether a row has all the serials it takes
 */
export function rowForScan(rows, productIds, { batchNumber, expiryDate }, isFull) {
  const ofProduct = rows.filter((row) => productIds.includes(row.productId));
  if (ofProduct.length === 0) {
    return { error: 'الصنف ليس في المستند' };
  }
  const lot = batchNumber?.toUpperCase();
  const matching = ofProduct.filter((row) => !row.batchNumber
    || ((!lot || row.batchNumber === lot) && sameMonth(row.expiryDate, expiryDate)));
  if (matching.length === 0) {
    return { error: `لا يوجد بند للتشغيلة "${batchNumber ?? ''}" بهذه الصلاحية من ${ofProduct[0].productName}` };
  }
  const open = matching.filter((row) => !isFull(row));
  if (open.length === 0) {
    return { error: 'سيريالات البند مكتملة' };
  }
  return open.length === 1 ? { row: open[0] } : { rows: open };
}

/**
 * The product a receiving document's (or a count's) scanned pack is of: the one with the pack's GTIN, or of several that share it,
 * the one the document has rows of. { productId } or { error }.
 *
 * @param {Array<object>} rows       the document's serial rows
 * @param {Array<number>} productIds the products with the pack's GTIN (at least one)
 */
export function scannedProduct(rows, productIds) {
  if (productIds.length === 1) {
    return { productId: productIds[0] };
  }
  const onDocument = productIds.filter((productId) => rows.some((row) => row.productId === productId));
  return onDocument.length === 1 ? { productId: onDocument[0] }
    : { error: 'أكثر من صنف بهذا الـ GTIN: أدخل سيريال العبوة يدوياً' };
}

/**
 * The products a document brings in partly with serials and partly without: some of their units have a serial, not
 * all, adding up their rows (SerialsSection's: quantity and serials). For the warning before posting.
 *
 * @returns {Array<{productName: string, quantity: number, serials: number}>}
 */
export function partlySerialized(rows) {
  const byProduct = new Map();
  for (const row of rows) {
    const product = byProduct.get(row.productId) ?? { productName: row.productName, quantity: 0, serials: 0 };
    product.quantity += Number(row.quantity);
    product.serials += row.serials.length;
    byProduct.set(row.productId, product);
  }
  return [...byProduct.values()].filter((product) => product.serials > 0 && product.serials < product.quantity);
}
