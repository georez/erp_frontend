'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import PrintDocument, { Signatures } from './PrintDocument';
import { DocumentTotals, ProductLines, hasVatLines } from './ProductLines';

/**
 * A sales invoice's printout (GET /api/sales-invoices/{id}/print): each product's line with the batches it takes and
 * their expiry dates, the totals, the total in words, and the customer's balance before and after it. Costs aren't
 * printed. A draft's batches are those named so far; posting chooses the rest. When no line has VAT, neither the VAT
 * column nor the VAT total is printed. Amounts are rounded to two decimals; quantities and percents are exact.
 */
export default function SalesInvoicePrint({ id }) {
  const { data, error } = useSWR(`/api/sales-invoices/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const invoice = data?.invoice;
  const hasVat = invoice != null && hasVatLines(invoice.lines);

  return <PrintDocument title="فاتورة مبيعات" number={invoice?.id ?? null} error={error}
    mark={invoice != null && invoice.status !== 'POSTED' ? 'مسودة' : null}
    party={{ label: 'العميل', contact: data?.customer }}
    details={invoice ? [
      { label: 'التاريخ', value: dayjs(invoice.postedAt ?? invoice.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: invoice.warehouseName },
    ] : []}>
    {invoice && <>
      <ProductLines lines={invoice.lines} hasVat={hasVat}
        batchesOf={(line) => line.batches.map((batch) => ({ key: batch.id, ...batch }))} />
      <div className="summary">
        <DocumentTotals document={invoice} hasVat={hasVat} balances={{
          previous: data.previousBalance, after: data.newBalance, afterLabel: 'الرصيد بعد الفاتورة',
        }} />
        {invoice.description && <p className="description">البيان: {invoice.description}</p>}
        <Signatures preparedLabel="أعدها" preparedBy={invoice.postedBy ?? invoice.createdBy} />
      </div>
    </>}
  </PrintDocument>;
}
