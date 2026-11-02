'use client';

import { useOpenLink } from '@/utils/useOpenLink';
import { AccountTreeControls } from '../accountTree/AccountTree';
import { useAccountTree } from '../accountTree/useAccountTree';
import ReportPageFrame from '../ReportPageFrame';
import { monthToDate, reportPageUrl, useReportPage } from '../useReportPage';
import ChartOfAccountsTable from './ChartOfAccountsTable';

/**
 * Chart of accounts: every account, with or without entries, as the trial balance's tree without its amounts. An
 * account's name opens its statement for the current month, whose dates the statement can change.
 *
 * The rows come from the report chartOfAccountsReport; the page's state is in its URL (useReportPage). All props come
 * from the dashboard URL's search parameters, so they are strings.
 *
 * @param {string} [props.execute]  "true" unless the URL says otherwise: there are no params to choose first, so the
 *   page shows the accounts as it opens, and تنفيذ reads them again
 */
export default function ChartOfAccounts({ formId, formTitle = 'دليل الحسابات', execute = 'true', requestTime, params }) {
  const openLink = useOpenLink();

  const report = useReportPage({
    reportName: 'chartOfAccountsReport',
    page: 'chart-of-accounts',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: {},
  });
  const tree = useAccountTree(report.rows);

  /** An account's statement for the current month. Titled without the account's name, like the trial balance's. */
  const statementLink = (row) => {
    const title = 'كشف حساب';
    const url = reportPageUrl('account-statement', title, { p_account_id: row.account_id, ...monthToDate() });
    return { url, title };
  };

  return <ReportPageFrame report={report} controls={<AccountTreeControls tree={tree} />}
    emptyText="لا توجد حسابات.">
    <ChartOfAccountsTable items={tree.items} onToggle={tree.toggle} statementLink={statementLink}
      openLink={openLink} />
  </ReportPageFrame>;
}
