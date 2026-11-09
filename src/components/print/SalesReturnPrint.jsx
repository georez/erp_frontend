'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import PrintDocument, { Signatures } from './PrintDocument';
import { DocumentTotals, ProductLines, hasVatLines } from './ProductLines';

/**
 * A sales return's printout (GET /api/sales-returns/{id}/print), as the sales invoice's: each product's line with the
 * batch it comes back into, the totals, the total in words, and the customer's balance before and after it (less the
 * return). Costs aren't printed. A return against an invoice names it.
 */
export default function SalesReturnPrint({ id }) {
  const { data, error } = useSWR(`/api/sales-returns/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const salesReturn = data?.salesReturn;
  const hasVat = salesReturn != null && hasVatLines(salesReturn.lines);

  return <PrintDocument title="مرتجع مبيعات" number={salesReturn?.id ?? null} error={error}
    mark={salesReturn != null && salesReturn.status !== 'POSTED' ? 'مسودة' : null}
    party={{ label: 'العميل', contact: data?.customer }}
    details={salesReturn ? [
      { label: 'التاريخ', value: dayjs(salesReturn.postedAt ?? salesReturn.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: salesReturn.warehouseName },
      ...(salesReturn.salesInvoiceId ? [{ label: 'عن الفاتورة', value: `رقم ${salesReturn.salesInvoiceId}` }] : []),
    ] : []}>
    {salesReturn && <>
      <ProductLines lines={salesReturn.lines} hasVat={hasVat}
        batchesOf={(line) => [{ key: line.id, batchNumber: line.batchNumber, expiryDate: line.expiryDate }]} />
      <div className="summary">
        <DocumentTotals document={salesReturn} hasVat={hasVat} balances={{
          previous: data.previousBalance, after: data.newBalance, afterLabel: 'الرصيد بعد المرتجع',
        }} />
        {salesReturn.description && <p className="description">البيان: {salesReturn.description}</p>}
        <Signatures preparedLabel="أعده" preparedBy={salesReturn.postedBy ?? salesReturn.createdBy} />
      </div>
    </>}
  </PrintDocument>;
}
