'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { Big } from 'bigdecimal.js';
import { fetchJson } from '@/utils/fetchJson';
import { formatExpiry } from '@/utils/expiryDates';
import { amountInWords } from '@/utils/amountInWords';
import PrintDocument, { Amount, Num, Signatures } from './PrintDocument';

/**
 * A sales invoice's printout (GET /api/sales-invoices/{id}/print): each product's line with the batches it takes and
 * their expiry dates, the totals, the total in words, and the customer's balance before and after it. Costs aren't
 * printed. A draft's batches are those named so far; posting chooses the rest. When no line has VAT, neither the VAT
 * column nor the VAT total is printed. Amounts are rounded to two decimals; quantities and percents are exact.
 */
export default function SalesInvoicePrint({ id }) {
  const { data, error } = useSWR(`/api/sales-invoices/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const invoice = data?.invoice;
  const isDraft = invoice != null && invoice.status !== 'POSTED';
  const hasVat = invoice != null && invoice.lines.some((line) => Big(line.vatPercent).signum() !== 0);

  return <PrintDocument title="فاتورة مبيعات" number={invoice?.id ?? null} isDraft={isDraft} error={error}
    party={{ label: 'العميل', contact: data?.customer }}
    details={invoice ? [
      { label: 'التاريخ', value: dayjs(invoice.postedAt ?? invoice.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: invoice.warehouseName },
    ] : []}>
    {invoice && <>
      <table className="lines">
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
        {invoice.lines.map((line, index) => <tbody key={line.id}>
          <tr>
            <td className="number">{index + 1}</td>
            <td>{line.productName}</td>
            <td className="number"><Num value={line.quantity} /></td>
            <td className="number"><Amount value={line.publicPrice} /></td>
            <td className="number"><Num value={line.discountPercent} /></td>
            {hasVat && <td className="number"><Num value={line.vatPercent} /></td>}
            <td className="number"><Amount value={line.netAmount} /></td>
          </tr>
          {line.batches.length > 0 && <tr className="batches">
            <td />
            <td colSpan={hasVat ? 6 : 5}>
              {line.batches.map((batch, batchIndex) => <span key={batch.id}>
                {batchIndex > 0 && '، '}
                تشغيلة <bdi dir="ltr">{batch.batchNumber}</bdi> صلاحية <bdi dir="ltr">{formatExpiry(batch.expiryDate)}</bdi>
                {line.batches.length > 1 && <> × <Num value={batch.quantity} /></>}
              </span>)}
            </td>
          </tr>}
        </tbody>)}
      </table>

      <div className="summary">
        <div className="totals-row">
          <div className="words">{amountInWords(invoice.total)}</div>
          <table className="totals">
            <tbody>
              <tr><th>الصافي</th><td className="number"><Amount value={invoice.netTotal} /></td></tr>
              {hasVat &&
                <tr><th>ضريبة القيمة المضافة</th><td className="number"><Amount value={invoice.vatTotal} /></td></tr>}
              <tr className="grand"><th>الإجمالي</th><td className="number"><Amount value={invoice.total} /></td></tr>
            </tbody>
          </table>
        </div>
        <div className="balances">
          <div><span>الرصيد السابق: </span><Amount value={data.previousBalance} /></div>
          <div><span>الرصيد بعد الفاتورة: </span><Amount value={data.newBalance} /></div>
        </div>
        {invoice.description && <p className="description">البيان: {invoice.description}</p>}
        <Signatures preparedLabel="أعدها" preparedBy={invoice.postedBy ?? invoice.createdBy} />
      </div>
    </>}
  </PrintDocument>;
}
