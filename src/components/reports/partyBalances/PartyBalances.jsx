'use client';

import { useMemo } from 'react';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import ReportPageFrame from '../ReportPageFrame';
import { monthToDate, reportPageUrl, useReportPage } from '../useReportPage';
import PartyBalancesTable from './PartyBalancesTable';

/**
 * Each kind's report, page and statement. A row's id and name are in its report's {kind}_id and {kind}_name columns.
 * Titled without the party's name: the window keeps its title, so a renamed party would leave the old name there (the
 * statement shows the current one).
 */
const BALANCES = {
  supplier: {
    reportName: 'supplierBalancesReport', page: 'supplier-balances', title: 'أرصدة الموردين',
    statementPage: 'supplier-statement', statementTitle: 'كشف حساب مورد', statementParam: 'p_supplier_id',
    idKey: 'supplier_id', nameKey: 'supplier_name', nameHeader: 'المورد',
    emptyText: 'لا توجد أرصدة موردين في هذه الفترة.',
  },
  customer: {
    reportName: 'customerBalancesReport', page: 'customer-balances', title: 'أرصدة العملاء',
    statementPage: 'customer-statement', statementTitle: 'كشف حساب عميل', statementParam: 'p_customer_id',
    idKey: 'customer_id', nameKey: 'customer_name', nameHeader: 'العميل',
    emptyText: 'لا توجد أرصدة عملاء في هذه الفترة.',
  },
};

/**
 * Supplier or customer balances (props.kind): per party, the opening balance, the period's debits and credits and the
 * closing balance, each balance as a debit or a credit, with their total. A party's name opens its statement for the
 * same period.
 *
 * The rows come from the kind's report; the page's state is in its URL (useReportPage). All props but kind come from
 * the dashboard URL's search parameters, so they are strings.
 *
 * @param {'supplier'|'customer'} props.kind  fixed by the page's URL (urlToComponentMap)
 */
export default function PartyBalances({ kind, formId, formTitle, execute, requestTime, params }) {
  const balances = BALANCES[kind];
  const openLink = useOpenLink();
  const report = useReportPage({
    reportName: balances.reportName,
    page: balances.page,
    formId,
    formTitle: formTitle || balances.title,
    params,
    execute,
    requestTime,
    initialParams: monthToDate(),
  });
  const { metadata, rows } = report;
  const total = useMemo(() => (metadata?.totals && rows.length > 0 ? totalsRow(rows, metadata.totals) : null),
    [metadata, rows]);

  /** A party's statement for the period the balances were run for. */
  const statementLink = (row) => {
    const period = parseJsonObject(params, {});
    const url = reportPageUrl(balances.statementPage, balances.statementTitle, {
      [balances.statementParam]: row[balances.idKey], p_from_date: period.p_from_date, p_to_date: period.p_to_date,
    });
    return { url, title: balances.statementTitle };
  };

  return <ReportPageFrame report={report} emptyText={balances.emptyText}>
    <PartyBalancesTable rows={rows} total={total} columns={balances} statementLink={statementLink}
      openLink={openLink} />
  </ReportPageFrame>;
}
