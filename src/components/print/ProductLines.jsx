'use client';

import { Big } from 'bigdecimal.js';
import { formatExpiry } from '@/utils/expiryDates';
import { amountInWords } from '@/utils/amountInWords';
import { printedRounding } from '@/utils/decimals';
import { Amount, Balance, Num } from './PrintDocument';

/** Whether any of the lines has a VAT rate: without, the VAT column and the VAT total aren't printed. */
export const hasVatLines = (lines) => lines.some((line) => Big(line.vatPercent).signum() !== 0);

/**
 * A document's products (a sales invoice's or return's): one row each, then a row under it with the batches it takes or
 * brings back and their expiry dates. Column titles repeat on every page; a product and its batches aren't split.
 *
 * @param lines     [{ id, productName, quantity, publicPrice, discountPercent, vatPercent, netAmount }]
 * @param batchesOf the line's batches: [{ key, batchNumber, expiryDate, quantity }]; a batch's quantity is printed
 *                  when the line has more than one
 * @param hasVat    whether to print the VAT column (hasVatLines)
 */
export function ProductLines({ lines, batchesOf, hasVat }) {
  return <table className="lines">
    <thead>
      <tr>
        <th>م</th>
        <th>الصنف</th>
        <th>الكمية</th>
        <th>سعر الجمهور</th>
        <th>خصم %</th>
        {hasVat && <th>ض %</th>}
        <th>القيمة</th>
      </tr>
    </thead>
    {lines.map((line, index) => {
      const batches = batchesOf(line);
      return <tbody key={line.id}>
        <tr>
          <td className="number">{index + 1}</td>
          <td>{line.productName}</td>
          <td className="number"><Num value={line.quantity} /></td>
          <td className="number"><Amount value={line.publicPrice} /></td>
          <td className="number"><Num value={line.discountPercent} /></td>
          {hasVat && <td className="number"><Num value={line.vatPercent} /></td>}
          <td className="number"><Amount value={line.netAmount} /></td>
        </tr>
        {batches.length > 0 && <tr className="batches">
          <td />
          <td colSpan={hasVat ? 6 : 5}>
            {batches.map((batch, batchIndex) => <span key={batch.key}>
              {batchIndex > 0 && '، '}
              تشغيلة <bdi dir="ltr">{batch.batchNumber}</bdi> صلاحية <bdi dir="ltr">{formatExpiry(batch.expiryDate)}</bdi>
              {batches.length > 1 && <> × <Num value={batch.quantity} /></>}
            </span>)}
          </td>
        </tr>}
      </tbody>;
    })}
  </table>;
}

/**
 * What comes after a document's products: its total in words beside its net, VAT (when it has any), the rounding
 * (when the printed net and VAT don't add up to the total) and total, then the customer's balance before and after
 * it.
 *
 * @param document   { netTotal, vatTotal, total }
 * @param balances   { previous, after, afterLabel }: e.g. "الرصيد بعد الفاتورة"
 */
export function DocumentTotals({ document, hasVat, balances }) {
  const rounding = printedRounding(document);
  return <>
    <div className="totals-row">
      <div className="words">{amountInWords(document.total)}</div>
      <table className="totals">
        <tbody>
          <tr><th>الصافي</th><td className="number"><Amount value={document.netTotal} /></td></tr>
          {hasVat &&
            <tr><th>ضريبة القيمة المضافة</th><td className="number"><Amount value={document.vatTotal} /></td></tr>}
          {rounding.signum() !== 0 &&
            <tr><th>فرق التقريب</th><td className="number"><Amount value={rounding.toPlainString()} /></td></tr>}
          <tr className="grand"><th>الإجمالي</th><td className="number"><Amount value={document.total} /></td></tr>
        </tbody>
      </table>
    </div>
    <div className="balances">
      <div><span>الرصيد السابق: </span><Balance value={balances.previous} /></div>
      <div><span>{balances.afterLabel}: </span><Balance value={balances.after} /></div>
    </div>
  </>;
}
