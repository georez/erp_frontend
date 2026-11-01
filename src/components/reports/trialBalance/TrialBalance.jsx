'use client';

import { useMemo, useState } from 'react';
import { Button, MenuItem, TextField } from '@mui/material';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import { buildAccountTree, parentAccountIds, treeDepth, visibleTreeRows } from '@/utils/trialBalanceTree';
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
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  // What the levels box shows: how many levels are open, or '' once accounts are opened or closed one by one
  const [shownLevels, setShownLevels] = useState('');

  const report = useReportPage({
    reportName: 'trialBalanceReport',
    page: 'trial-balance',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: monthToDate(),
    // A new result opens the whole tree
    onRows: (rows) => {
      const resultRoots = buildAccountTree(rows);
      setExpandedIds(parentAccountIds(resultRoots));
      setShownLevels(treeDepth(resultRoots) || '');
    },
  });
  const { metadata, rows } = report;

  const roots = useMemo(() => buildAccountTree(rows), [rows]);
  const items = useMemo(() => visibleTreeRows(roots, expandedIds), [roots, expandedIds]);
  const depth = useMemo(() => treeDepth(roots), [roots]);
  const total = useMemo(() => (metadata?.totals && rows.length > 0 ? totalsRow(rows, metadata.totals) : null),
    [metadata, rows]);

  /** An account's statement for the period the trial balance was run for. */
  const statementLink = (row) => {
    const period = parseJsonObject(params, {});
    const title = `كشف حساب ${row.account_name}`;
    const url = reportPageUrl('account-statement', title, {
      p_account_id: row.account_id, p_from_date: period.p_from_date, p_to_date: period.p_to_date,
    });
    return { url, title };
  };

  const toggle = (accountId) => {
    setShownLevels('');
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };
  /** Shows the tree down to a level: 1 for the top accounts only, the tree's depth for all of it. */
  const showLevels = (levels) => {
    setShownLevels(levels);
    setExpandedIds(parentAccountIds(roots, levels - 1));
  };

  const treeControls = <>
    <Button size="small" sx={{ mt: 1.5 }} disabled={rows.length === 0}
      onClick={() => showLevels(depth)}>توسيع الكل</Button>
    <Button size="small" sx={{ mt: 1.5 }} disabled={rows.length === 0}
      onClick={() => showLevels(1)}>طي الكل</Button>
    <TextField select size="small" label="المستويات" value={shownLevels} sx={{ minWidth: 150, mt: 1 }}
      disabled={depth === 0} onChange={(event) => showLevels(Number(event.target.value))}>
      {Array.from({ length: depth }, (unused, index) => index + 1).map((levels) =>
        <MenuItem key={levels} value={levels}>{`حتى المستوى ${levels}`}</MenuItem>)}
    </TextField>
  </>;

  return <ReportPageFrame report={report} controls={treeControls} emptyText="لا توجد قيود مرحلة حتى نهاية الفترة.">
    <TrialBalanceTable items={items} total={total} onToggle={toggle} statementLink={statementLink}
      openLink={openLink} />
  </ReportPageFrame>;
}
