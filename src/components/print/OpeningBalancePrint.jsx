'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import PrintDocument, { Amount, Signatures } from './PrintDocument';
import { ProductLines } from './ProductLines';

/**
 * An opening balance's printout (GET /api/opening-balances/{id}): each batch the warehouse starts with, at its public
 * price less the discount it's valued at, and the stock's total value.
 */
export default function OpeningBalancePrint({ id }) {
  const { data: openingBalance, error } = useSWR(`/api/opening-balances/${id}`, fetchJson,
    { revalidateOnFocus: false });

  return <PrintDocument title="رصيد افتتاحي للمخزون" number={openingBalance?.id ?? null} error={error}
    mark={openingBalance != null && openingBalance.status !== 'POSTED' ? 'مسودة' : null}
    details={openingBalance ? [
      { label: 'التاريخ', value: dayjs(openingBalance.postedAt ?? openingBalance.createdAt).format('DD/MM/YYYY') },
      { label: 'المخزن', value: openingBalance.warehouseName },
    ] : []}>
    {openingBalance && <>
      {/* No VAT: stock is valued at its cost */}
      <ProductLines lines={openingBalance.lines.map((line) => ({ ...line, netAmount: line.value }))} hasVat={false}
        batchesOf={(line) => [{ key: line.id, batchNumber: line.batchNumber, expiryDate: line.expiryDate }]} />
      <div className="summary">
        <div className="totals-row">
          <div className="totals-space" />
          <table className="totals">
            <tbody>
              <tr className="grand"><th>إجمالي القيمة</th>
                <td className="number"><Amount value={openingBalance.totalValue} /></td></tr>
            </tbody>
          </table>
        </div>
        {openingBalance.description && <p className="description">البيان: {openingBalance.description}</p>}
        <Signatures preparedLabel="أعده" preparedBy={openingBalance.postedBy ?? openingBalance.createdBy}
          signedBy="أمين المخزن" />
      </div>
    </>}
  </PrintDocument>;
}
