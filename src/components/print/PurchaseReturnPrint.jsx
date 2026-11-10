'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import PrintDocument, { Signatures } from './PrintDocument';
import { DocumentTotals, ProductLines, hasVatLines } from './ProductLines';

/**
 * A purchase return's printout (GET /api/purchase-returns/{id}/print), as the sales return's: each product's line with
 * the batch it goes out of, the totals, the total in words, and the supplier's balance before and after it. A return
 * against an invoice names it. Its cost and price difference aren't printed: the supplier gets it.
 */
export default function PurchaseReturnPrint({ id }) {
  const { data, error } = useSWR(`/api/purchase-returns/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const purchaseReturn = data?.purchaseReturn;
  const hasVat = purchaseReturn != null && hasVatLines(purchaseReturn.lines);

  return <PrintDocument title="مرتجع مشتريات" number={purchaseReturn?.id ?? null} error={error}
    mark={purchaseReturn != null && purchaseReturn.status !== 'POSTED' ? 'مسودة' : null}
    party={{ label: 'المورد', contact: data?.supplier }}
    details={purchaseReturn ? [
      { label: 'التاريخ', value: dayjs(purchaseReturn.postedAt ?? purchaseReturn.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: purchaseReturn.warehouseName },
      ...(purchaseReturn.purchaseInvoiceId
        ? [{ label: 'عن الفاتورة', value: `رقم ${purchaseReturn.purchaseInvoiceId}` }] : []),
    ] : []}>
    {purchaseReturn && <>
      <ProductLines lines={purchaseReturn.lines} hasVat={hasVat}
        batchesOf={(line) => [{ key: line.id, batchNumber: line.batchNumber, expiryDate: line.expiryDate }]} />
      <div className="summary">
        <DocumentTotals document={purchaseReturn} hasVat={hasVat} balances={{
          previous: data.previousBalance, after: data.newBalance, afterLabel: 'الرصيد بعد المرتجع',
        }} />
        {purchaseReturn.description && <p className="description">البيان: {purchaseReturn.description}</p>}
        <Signatures preparedLabel="أعده" preparedBy={purchaseReturn.postedBy ?? purchaseReturn.createdBy} />
      </div>
    </>}
  </PrintDocument>;
}
