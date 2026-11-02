'use client';

import { useMemo } from 'react';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import { AccountTreeControls } from '../accountTree/AccountTree';
import { useAccountTree } from '../accountTree/useAccountTree';
import ReportPageFrame from '../ReportPageFrame';
import { monthToDate, reportPageUrl, useReportPage } from '../useReportPage';
import TrialBalanceTable from './TrialBalanceTable';

/**
 * Trial balance: the accounts' opening balances, the period's debits and credits and the closing balances, as a tree
 * of accounts that can be expanded and collapsed, with the total of the leaf accounts under it. An account's name
 * opens its statement for the same period.
 *
 * The rows come from the report trialBalanceReport; the page's state is in its URL (useReportPage). All props come
 * from the dashboard URL's search parameters, so they are strings.
 */
export default function TrialBalance({ formId, formTitle = 'ميزان المراجعة', execute, requestTime, params }) {
  const openLink = useOpenLink();

  const report = useReportPage({
    reportName: 'trialBalanceReport',
    page: 'trial-balance',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: monthToDate(),
  });
  const { metadata, rows } = report;
  const tree = useAccountTree(rows);
  const total = useMemo(() => (metadata?.totals && rows.length > 0 ? totalsRow(rows, metadata.totals) : null),
    [metadata, rows]);

  /**
   * An account's statement for the period the trial balance was run for. Titled without the account's name: the window
   * keeps its title, so a renamed account would leave the old name there (the statement shows the current one).
   */
  const statementLink = (row) => {
    const period = parseJsonObject(params, {});
    const title = 'كشف حساب';
    const url = reportPageUrl('account-statement', title, {
      p_account_id: row.account_id, p_from_date: period.p_from_date, p_to_date: period.p_to_date,
    });
    return { url, title };
  };

  return <ReportPageFrame report={report} controls={<AccountTreeControls tree={tree} />}
    emptyText="لا توجد قيود مرحلة حتى نهاية الفترة.">
    <TrialBalanceTable items={tree.items} total={total} onToggle={tree.toggle} statementLink={statementLink}
      openLink={openLink} />
  </ReportPageFrame>;
}
