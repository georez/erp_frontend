'use client';

import { useMemo } from 'react';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import ReportPageFrame from '../ReportPageFrame';
import { monthToDate, reportPageUrl, useReportPage } from '../useReportPage';
import SupplierBalancesTable from './SupplierBalancesTable';

/**
 * Supplier balances: per supplier, the opening balance, the period's debits and credits and the closing balance, each
 * balance as a debit or a credit, with their total. A supplier's name opens its statement for the same period.
 *
 * The rows come from the report supplierBalancesReport; the page's state is in its URL (useReportPage). All props
 * come from the dashboard URL's search parameters, so they are strings.
 */
export default function SupplierBalances({ formId, formTitle = 'أرصدة الموردين', execute, requestTime, params }) {
  const openLink = useOpenLink();
  const report = useReportPage({
    reportName: 'supplierBalancesReport',
    page: 'supplier-balances',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: monthToDate(),
  });
  const { metadata, rows } = report;
  const total = useMemo(() => (metadata?.totals && rows.length > 0 ? totalsRow(rows, metadata.totals) : null),
    [metadata, rows]);

  /** A supplier's statement for the period the balances were run for. */
  const statementLink = (row) => {
    const period = parseJsonObject(params, {});
    const title = `كشف حساب مورد ${row.supplier_name}`;
    const url = reportPageUrl('supplier-statement', title, {
      p_supplier_id: row.supplier_id, p_from_date: period.p_from_date, p_to_date: period.p_to_date,
    });
    return { url, title };
  };

  return <ReportPageFrame report={report} emptyText="لا توجد أرصدة موردين في هذه الفترة.">
    <SupplierBalancesTable rows={rows} total={total} statementLink={statementLink} openLink={openLink} />
  </ReportPageFrame>;
}
