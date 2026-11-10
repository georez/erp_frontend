'use client';

import dayjs from 'dayjs';
import useSWR from 'swr';
import { Big } from 'bigdecimal.js';
import { fetchJson } from '@/utils/fetchJson';
import { documentPageOf } from '@/utils/journalEntries';
import { linkTarget } from '@/utils/reportutils';
import { formatExactAmount } from '@/utils/decimals';
import PrintDocument, { Signatures } from './PrintDocument';

// A line's party, by its account's subledger
const PARTY_LABELS = { CUSTOMER: 'العميل', SUPPLIER: 'المورد' };

/** An entry's amount as printed: exactly, as the books keep it, with at least two decimals ("1,652.9135", "850.00"). */
function Exact({ value }) {
  return <bdi dir="ltr">{formatExactAmount(value)}</bdi>;
}

/** A debit or a credit as printed: empty for the side a line isn't on. */
const side = (value) => (Big(value).signum() === 0 ? '' : <Exact value={value} />);

/** Where the entry comes from: its document ("فاتورة مبيعات رقم 26"), "قيد يدوي", or the document type as stored. */
function originOf(entry) {
  if (entry.manual) {
    return 'قيد يدوي';
  }
  const page = documentPageOf(entry.sourceType);
  const target = page ? linkTarget({ documentColumn: 'page', idColumn: 'sourceId' },
    { page, sourceId: entry.sourceId }) : null;
  return `${target ? target.title : entry.sourceType} رقم ${entry.sourceId}`;
}

/**
 * A journal entry's printout (GET /api/journal-entries/{id}), manual or a document's: each line's account with its
 * customer or supplier, its description, and its debit or credit, then the totals. A draft is marked مسودة; an entry
 * that was reversed معكوس, with the entry that reversed it.
 */
export default function JournalEntryPrint({ id }) {
  const { data: entry, error } = useSWR(`/api/journal-entries/${id}`, fetchJson, { revalidateOnFocus: false });

  let mark = null;
  if (entry?.status === 'DRAFT') {
    mark = 'مسودة';
  } else if (entry?.reversedByEntryId != null) {
    mark = 'معكوس';
  }

  return <PrintDocument title="قيد يومية" number={entry?.id ?? null} mark={mark} error={error}
    details={entry ? [
      { label: 'التاريخ', value: entry.entryDatetime ? dayjs(entry.entryDatetime).format('DD/MM/YYYY') : 'عند الترحيل' },
      { label: 'المصدر', value: originOf(entry) },
      ...(entry.reversesEntryId ? [{ label: 'يعكس', value: `القيد رقم ${entry.reversesEntryId}` }] : []),
    ] : []}>
    {entry && <>
      {entry.description && <p className="description entry-description">البيان: {entry.description}</p>}
      <table className="lines">
        <thead>
          <tr>
            <th>م</th>
            <th>الحساب</th>
            <th>البيان</th>
            <th>مدين</th>
            <th>دائن</th>
          </tr>
        </thead>
        {entry.lines.map((line, index) => <tbody key={line.id}>
          <tr>
            <td className="number">{index + 1}</td>
            <td>
              {line.accountName}
              {line.partyName && <div className="line-party">{PARTY_LABELS[line.subledger]}: {line.partyName}</div>}
            </td>
            <td>{line.description}</td>
            <td className="number">{side(line.debit)}</td>
            <td className="number">{side(line.credit)}</td>
          </tr>
        </tbody>)}
        <tbody className="entry-totals">
          <tr>
            <td />
            <td colSpan={2}>الإجمالي</td>
            <td className="number"><Exact value={entry.totalDebit} /></td>
            <td className="number"><Exact value={entry.totalCredit} /></td>
          </tr>
        </tbody>
      </table>

      <div className="summary">
        {entry.reversedByEntryId != null &&
          <p className="description">عُكس هذا القيد بالقيد رقم {entry.reversedByEntryId}</p>}
        <Signatures preparedLabel="أعده" preparedBy={entry.postedBy ?? entry.createdBy} signedBy="المراجع" />
      </div>
    </>}
  </PrintDocument>;
}
