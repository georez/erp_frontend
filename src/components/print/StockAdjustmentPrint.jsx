'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { Big } from 'bigdecimal.js';
import { fetchJson } from '@/utils/fetchJson';
import { formatAmount, formatDecimal } from '@/utils/decimals';
import { formatExpiry } from '@/utils/expiryDates';
import PrintDocument, { Amount, Num, Signatures } from './PrintDocument';

/**
 * A gain or a loss as printed, with its sign: "+3", "-2", "0"; an amount rounded to two decimals ("+45.00"). "—" for
 * none (a value a draft can't work out yet).
 */
function Signed({ value, amount = false }) {
  if (value == null) {
    return '—';
  }
  const text = amount ? formatAmount(value) : formatDecimal(Big(value));
  return <bdi dir="ltr">{Big(value).signum() > 0 ? `+${text}` : text}</bdi>;
}

/** The lines' values added up: the gains (positive), the losses (negative) and both. */
function totalsOf(lines) {
  let gains = Big('0');
  let losses = Big('0');
  for (const line of lines) {
    if (line.value != null) {
      const value = Big(line.value);
      if (value.signum() > 0) {
        gains = gains.add(value);
      } else {
        losses = losses.add(value);
      }
    }
  }
  return { gains: gains.toPlainString(), losses: losses.toPlainString(), net: gains.add(losses).toPlainString() };
}

/**
 * A stock adjustment's printout (GET /api/stock-adjustments/{id}): each batch counted, with what the warehouse had, what
 * was counted, the difference, what a unit of it costs and its value; then the gains, the losses and the net. A
 * draft's balances and values are as posting would work them out now. The warehouse keeper signs for the count.
 */
export default function StockAdjustmentPrint({ id }) {
  const { data: adjustment, error } = useSWR(`/api/stock-adjustments/${id}`, fetchJson, { revalidateOnFocus: false });
  const totals = adjustment ? totalsOf(adjustment.lines) : null;

  return <PrintDocument title="تسوية مخزون" number={adjustment?.id ?? null} error={error}
    mark={adjustment != null && adjustment.status !== 'POSTED' ? 'مسودة' : null}
    details={adjustment ? [
      { label: 'التاريخ', value: dayjs(adjustment.postedAt ?? adjustment.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: adjustment.warehouseName },
    ] : []}>
    {adjustment && <>
      <table className="lines">
        <thead>
          <tr>
            <th>م</th>
            <th>الصنف</th>
            <th>الرصيد</th>
            <th>الفعلي</th>
            <th>الفرق</th>
            <th>تكلفة الوحدة</th>
            <th>القيمة</th>
          </tr>
        </thead>
        {adjustment.lines.map((line, index) => <tbody key={line.id}>
          <tr>
            <td className="number">{index + 1}</td>
            <td>{line.productName}</td>
            <td className="number"><Num value={line.balanceQuantity} /></td>
            <td className="number"><Num value={line.countedQuantity} /></td>
            <td className="number"><Signed value={line.difference} /></td>
            <td className="number">{line.unitCost == null ? '—' : <Amount value={line.unitCost} />}</td>
            <td className="number"><Signed value={line.value} amount /></td>
          </tr>
          <tr className="batches">
            <td />
            <td colSpan={6}>
              تشغيلة <bdi dir="ltr">{line.batchNumber}</bdi> صلاحية <bdi dir="ltr">{formatExpiry(line.expiryDate)}</bdi>
            </td>
          </tr>
        </tbody>)}
      </table>

      <div className="summary">
        <div className="totals-row">
          <div className="totals-space" />
          <table className="totals">
            <tbody>
              <tr><th>قيمة الزيادة</th><td className="number"><Signed value={totals.gains} amount /></td></tr>
              <tr><th>قيمة العجز</th><td className="number"><Signed value={totals.losses} amount /></td></tr>
              <tr className="grand"><th>صافي التسوية</th>
                <td className="number"><Signed value={totals.net} amount /></td></tr>
            </tbody>
          </table>
        </div>
        {adjustment.description && <p className="description">البيان: {adjustment.description}</p>}
        <Signatures preparedLabel="أعدها" preparedBy={adjustment.postedBy ?? adjustment.createdBy}
          signedBy="أمين المخزن" />
      </div>
    </>}
  </PrintDocument>;
}
