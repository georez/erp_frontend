'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import { amountInWords } from '@/utils/amountInWords';
import PrintDocument, { Amount, Balance, Signatures } from './PrintDocument';

// What makes a voucher a payment's or a receipt's
const PAYMENT = {
  api: '/api/payments', title: 'سند صرف', otherLabel: 'صُرف إلى', cashLabel: 'صُرف من', signedBy: 'المستلم',
};
const RECEIPT = {
  api: '/api/receipts', title: 'سند قبض', otherLabel: 'استُلم من', cashLabel: 'أُودع في', signedBy: 'أمين الخزينة',
};

// The party box's label, by the other account's subledger
const PARTY_LABELS = { CUSTOMER: 'العميل', SUPPLIER: 'المورد' };

/**
 * A payment's or a receipt's voucher (GET /api/payments|receipts/{id}/print): the amount and the amount in words, who
 * it was paid to or received from, the account and the cash box or bank, the reference and the description. When the
 * other account names a customer or supplier: them at the top, and their balance before and after it, as their
 * statement shows it. A draft is marked مسودة; a reversed voucher معكوس, with the entry that reversed it.
 */
function CashDocumentPrint({ kind, id }) {
  const { data, error } = useSWR(`${kind.api}/${id}/print`, fetchJson, { revalidateOnFocus: false });
  const voucher = data?.document;
  const party = data?.party;

  let mark = null;
  if (voucher?.status === 'DRAFT') {
    mark = 'مسودة';
  } else if (voucher?.reversalEntryId != null) {
    mark = 'معكوس';
  }
  const date = voucher?.documentDatetime ?? voucher?.postedAt;

  return <PrintDocument title={kind.title} number={voucher?.id ?? null} mark={mark} error={error}
    party={party ? { label: PARTY_LABELS[voucher.accountSubledger], contact: party } : null}
    details={voucher ? [
      { label: 'التاريخ', value: date ? dayjs(date).format('DD/MM/YYYY') : 'عند الترحيل' },
    ] : []}>
    {voucher && <div className="summary">
      <table className="voucher">
        <tbody>
          <tr className="voucher-amount"><th>المبلغ</th><td><Amount value={voucher.amount} /></td></tr>
          <tr><th>مبلغ وقدره</th><td>{amountInWords(voucher.amount)}</td></tr>
          {/* Without a party, the account is who it's paid to or received from */}
          <tr><th>{kind.otherLabel}</th><td>{party?.name ?? voucher.accountName}</td></tr>
          {party && <tr><th>الحساب</th><td>{voucher.accountName}</td></tr>}
          <tr><th>{kind.cashLabel}</th><td>{voucher.cashAccountName}</td></tr>
          {voucher.reference && <tr><th>المرجع</th><td><bdi dir="ltr">{voucher.reference}</bdi></td></tr>}
          {voucher.description && <tr><th>وذلك عن</th><td>{voucher.description}</td></tr>}
        </tbody>
      </table>
      {voucher.reversalEntryId != null &&
        <p className="description">عُكس هذا السند بالقيد رقم {voucher.reversalEntryId}</p>}
      {party && <div className="balances">
        <div><span>الرصيد السابق: </span><Balance value={data.previousBalance} /></div>
        <div><span>الرصيد بعد السند: </span><Balance value={data.newBalance} /></div>
      </div>}
      <Signatures preparedLabel="أعده" preparedBy={voucher.postedBy ?? voucher.createdBy} signedBy={kind.signedBy} />
    </div>}
  </PrintDocument>;
}

export function PaymentPrint({ id }) {
  return <CashDocumentPrint kind={PAYMENT} id={id} />;
}

export function ReceiptPrint({ id }) {
  return <CashDocumentPrint kind={RECEIPT} id={id} />;
}
