'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { Big } from 'bigdecimal.js';
import { fetchJson } from '@/utils/fetchJson';
import { formatExpiry } from '@/utils/expiryDates';
import PrintDocument, { Amount, Num, Signatures } from './PrintDocument';

/** The quantities of the lines added up. */
const totalQuantity = (lines) => lines.reduce((total, line) => total.add(Big(line.quantity)), Big(0)).toPlainString();

/**
 * The row under a product: the batches it moves and their expiry dates, each batch's quantity when there are several.
 * A draft's are those named so far, with what's left for posting to choose.
 */
function BatchesRow({ line, isPosted }) {
  const unbatched = isPosted ? '0' : line.unbatchedQuantity;
  const countEach = line.batches.length > 1 || Big(unbatched).signum() > 0;
  if (line.batches.length === 0 && Big(unbatched).signum() === 0) {
    return null;
  }
  return <tr className="batches">
    <td />
    <td colSpan={6}>
      {line.batches.map((batch, index) => <span key={batch.id}>
        {index > 0 && '، '}
        تشغيلة <bdi dir="ltr">{batch.batchNumber}</bdi> صلاحية <bdi dir="ltr">{formatExpiry(batch.expiryDate)}</bdi>
        {countEach && <> × <Num value={batch.quantity} /></>}
      </span>)}
      {Big(unbatched).signum() > 0 && <span>
        {line.batches.length > 0 && '، '}
        <Num value={unbatched} /> تُحدَّد تشغيلاتها عند الترحيل
      </span>}
    </td>
  </tr>;
}

/**
 * A stock transfer's printout (GET /api/stock-transfers/{id}): each product moved, with its public price, what a unit
 * costs as a discount off it and as an amount, and its value, the batches under it; then the total quantity and value. A draft's values are at the first warehouse's average now.
 * Both warehouse keepers sign: the one who sends the goods and the one who receives them.
 */
export default function StockTransferPrint({ id }) {
  const { data: transfer, error } = useSWR(`/api/stock-transfers/${id}`, fetchJson, { revalidateOnFocus: false });
  const isPosted = transfer?.status === 'POSTED';

  return <PrintDocument title="تحويل مخزني" number={transfer?.id ?? null} error={error}
    mark={transfer != null && !isPosted ? 'مسودة' : null}
    details={transfer ? [
      { label: 'التاريخ', value: dayjs(transfer.postedAt ?? transfer.createdAt).format('DD/MM/YYYY') },
      { label: 'من مخزن', value: transfer.fromWarehouseName },
      { label: 'إلى مخزن', value: transfer.toWarehouseName },
    ] : []}>
    {transfer && <>
      <table className="lines">
        <thead>
          <tr>
            <th>م</th>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>سعر الجمهور</th>
            <th>خصم %</th>
            <th>تكلفة الوحدة</th>
            <th>القيمة</th>
          </tr>
        </thead>
        {transfer.lines.map((line, index) => <tbody key={line.id}>
          <tr>
            <td className="number">{index + 1}</td>
            <td>{line.productName}</td>
            <td className="number"><Num value={line.quantity} /></td>
            <td className="number"><Amount value={line.publicPrice} /></td>
            <td className="number">{line.discountPercent == null ? '—' : <Num value={line.discountPercent} />}</td>
            <td className="number">{line.unitCost == null ? '—' : <Amount value={line.unitCost} />}</td>
            <td className="number">{line.value == null ? '—' : <Amount value={line.value} />}</td>
          </tr>
          <BatchesRow line={line} isPosted={isPosted} />
        </tbody>)}
      </table>

      <div className="summary">
        <div className="totals-row">
          <div className="totals-space" />
          <table className="totals">
            <tbody>
              <tr><th>إجمالي الكمية</th><td className="number"><Num value={totalQuantity(transfer.lines)} /></td></tr>
              <tr className="grand"><th>القيمة بالتكلفة</th>
                <td className="number">{transfer.valueTotal == null ? '—' : <Amount value={transfer.valueTotal} />}</td></tr>
            </tbody>
          </table>
        </div>
        {transfer.description && <p className="description">البيان: {transfer.description}</p>}
        <Signatures preparedLabel="أعده" preparedBy={transfer.postedBy ?? transfer.createdBy}
          signedBy={['أمين المخزن المرسل', 'أمين المخزن المستلم']} />
      </div>
    </>}
  </PrintDocument>;
}
