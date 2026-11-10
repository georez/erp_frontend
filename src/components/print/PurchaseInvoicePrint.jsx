'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import PrintDocument, { Signatures } from './PrintDocument';
import { DocumentTotals, ProductLines, hasVatLines } from './ProductLines';

/**
 * A purchase invoice's printout (GET /api/purchase-invoices/{id}/print), as the sales invoice's: each product's line
 * with its batches and their expiry dates, the totals, the total in words, and the supplier's balance before and
 * after it. It names the supplier's own invoice number and date when it has them. The warehouse keeper signs for the
 * goods.
 */
export default function PurchaseInvoicePrint({ id }) {
  const { data, error } = useSWR(`/api/purchase-invoices/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const invoice = data?.invoice;
  const hasVat = invoice != null && hasVatLines(invoice.lines);

  return <PrintDocument title="فاتورة مشتريات" number={invoice?.id ?? null} error={error}
    mark={invoice != null && invoice.status !== 'POSTED' ? 'مسودة' : null}
    party={{ label: 'المورد', contact: data?.supplier }}
    details={invoice ? [
      { label: 'التاريخ', value: dayjs(invoice.postedAt ?? invoice.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: invoice.warehouseName },
      ...(invoice.supplierInvoiceNumber ? [{ label: 'فاتورة المورد', value: invoice.supplierInvoiceNumber }] : []),
      ...(invoice.supplierInvoiceDate
        ? [{ label: 'بتاريخ', value: dayjs(invoice.supplierInvoiceDate).format('DD/MM/YYYY') }] : []),
    ] : []}>
    {invoice && <>
      <ProductLines lines={invoice.lines} hasVat={hasVat}
        batchesOf={(line) => line.batches.map((batch) => ({ key: batch.id, ...batch }))} />
      <div className="summary">
        <DocumentTotals document={invoice} hasVat={hasVat} balances={{
          previous: data.previousBalance, after: data.newBalance, afterLabel: 'الرصيد بعد الفاتورة',
        }} />
        {invoice.description && <p className="description">البيان: {invoice.description}</p>}
        <Signatures preparedLabel="أعدها" preparedBy={invoice.postedBy ?? invoice.createdBy} signedBy="أمين المخزن" />
      </div>
    </>}
  </PrintDocument>;
}
