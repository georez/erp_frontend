'use client';

import { useMemo } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { balanceColumns, statementSummary } from '@/utils/statement';
import { parseJsonObject } from '@/utils/reportutils';
import { formatAmount } from '@/utils/decimals';
import { useOpenLink } from '@/utils/useOpenLink';
import ReportPageFrame from '../ReportPageFrame';
import { monthToDate, useReportPage } from '../useReportPage';
import StatementTable from './StatementTable';

/** One side of a summary pair: "مدين" or "دائن" over its amount (0.00 when it has none). */
function SideFigure({ side, amount }) {
  return <Box sx={{ minWidth: 110 }}>
    <Typography variant="caption" color="text.secondary">{side}</Typography>
    {/* Under its caption (the box is right to left); the number itself left to right, so a sign stays in front */}
    <Typography sx={{ fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
      <bdi dir="ltr">{amount || '0.00'}</bdi>
    </Typography>
  </Box>;
}

/** One pair of the summary, like the table's columns: its label over its debit and its credit. */
function SummaryPair({ label, debit, credit }) {
  return <Box data-summary={label} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.5 }}>
    <Typography variant="body2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>{label}</Typography>
    <Stack direction="row" spacing={2}>
      <SideFigure side="مدين" amount={debit} />
      <SideFigure side="دائن" amount={credit} />
    </Stack>
  </Box>;
}

/**
 * The statements this page shows: their report (with the same columns: see accountStatementReport), their page, their
 * title and the param that names whose statement it is.
 */
const STATEMENTS = {
  // An account's lines; a parent account's covers the accounts under it. The trial balance opens it.
  account: {
    reportName: 'accountStatementReport', page: 'account-statement', title: 'كشف حساب', subjectParam: 'p_account_id',
  },
  // A supplier's lines, on the supplier control accounts. The supplier balances page opens it.
  supplier: {
    reportName: 'supplierStatementReport', page: 'supplier-statement', title: 'كشف حساب مورد',
    subjectParam: 'p_supplier_id',
  },
  // A customer's lines, on the customer control accounts. A journal entry's customer line opens it.
  customer: {
    reportName: 'customerStatementReport', page: 'customer-statement', title: 'كشف حساب عميل',
    subjectParam: 'p_customer_id',
  },
};

/**
 * A statement (of an account, or of a supplier: props.kind): the balance before the period, each posted line of the
 * period with the balance after it and the document it came from, and the period's totals.
 *
 * The page's state is in its URL (useReportPage). All props but kind come from the dashboard URL's search parameters,
 * so they are strings.
 *
 * @param {'account'|'supplier'|'customer'} props.kind  fixed by the page's URL (urlToComponentMap)
 */
export default function StatementPage({ kind, formId, formTitle, execute, requestTime, params }) {
  const statement = STATEMENTS[kind];
  const openLink = useOpenLink();
  const report = useReportPage({
    reportName: statement.reportName,
    page: statement.page,
    formId,
    formTitle: formTitle ?? statement.title,
    params,
    execute,
    requestTime,
    initialParams: { [statement.subjectParam]: null, ...monthToDate() },
  });
  const summary = useMemo(() => statementSummary(report.rows), [report.rows]);
  // Whose statement the rows are: the params they were run with (the URL's), not the ones being edited
  const subjectId = parseJsonObject(params, {})[statement.subjectParam] ?? null;

  let figures = null;
  if (summary) {
    const opening = balanceColumns(summary.opening);
    const closing = balanceColumns(summary.closing);
    figures = <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', p: 1, flexShrink: 0 }}>
      <SummaryPair label="رصيد أول المدة" debit={opening.debit} credit={opening.credit} />
      <SummaryPair label="حركة الفترة" debit={formatAmount(summary.debit)} credit={formatAmount(summary.credit)} />
      <SummaryPair label="رصيد آخر المدة" debit={closing.debit} credit={closing.credit} />
    </Stack>;
  }

  return <ReportPageFrame report={report} emptyText="لا توجد بيانات.">
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {figures}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <StatementTable kind={kind} subjectId={subjectId} rows={report.rows} summary={summary} openLink={openLink} />
      </Box>
    </Box>
  </ReportPageFrame>;
}
