'use client';

import { Alert, Box, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { Big } from 'bigdecimal.js';
import { formatAmount, formatStatementAmount } from '@/utils/decimals';
import { openLinkOnPlainClick, useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject } from '@/utils/reportutils';
import ReportPageFrame from '../ReportPageFrame';
import { reportPageUrl, today, useReportPage, yearToDate } from '../useReportPage';
import { Amount, AMOUNT_CELL, HEADER_CELL } from '../virtualTable';

/**
 * Each statement's report, page and first params, and the period an account's statement opens for: the income
 * statement's own, or for the balance sheet the year up to its day (the account's balance at the end of it is the
 * one shown).
 */
const STATEMENTS = {
  income: {
    reportName: 'incomeStatementReport', page: 'income-statement', title: 'قائمة الدخل', initialParams: yearToDate,
    emptyText: 'لا توجد قيود مرحلة في هذه الفترة.',
    statementPeriod: (params) => ({ p_from_date: params.p_from_date, p_to_date: params.p_to_date }),
  },
  balance: {
    reportName: 'balanceSheetReport', page: 'balance-sheet', title: 'الميزانية', initialParams: today,
    emptyText: 'لا توجد قيود مرحلة حتى هذا اليوم.',
    statementPeriod: (params) => ({ p_from_date: `${params.p_date?.slice(0, 4)}-01-01`, p_to_date: params.p_date }),
  },
};

// The balance sheet's two totals (its report's sections), which must be equal
const TOTAL_ASSETS_SECTION = 3;
const TOTAL_LIABILITIES_AND_EQUITY_SECTION = 12;

/** How each kind of line looks: a section's heading, an account, a total under some lines, a step's result. */
const LINE_STYLES = {
  heading: { fontWeight: 'bold', backgroundColor: 'action.hover' },
  account: {},
  total: { fontWeight: 'bold', borderTop: 1, borderTopColor: 'text.primary' },
  result: { fontWeight: 'bold', fontSize: '1rem', borderTop: 1, borderTopColor: 'text.primary', borderBottom: 3,
    borderBottomStyle: 'double', borderBottomColor: 'text.primary' },
};

/** The balance sheet's two totals when they differ (they never should: every posted entry balances), else null. */
function imbalance(rows) {
  const totalOf = (section) => rows.find((row) => Number(row.section) === section)?.amount;
  const assets = totalOf(TOTAL_ASSETS_SECTION);
  const liabilitiesAndEquity = totalOf(TOTAL_LIABILITIES_AND_EQUITY_SECTION);
  if (assets == null || liabilitiesAndEquity == null
    || Big(String(assets)).compareTo(Big(String(liabilitiesAndEquity))) === 0) {
    return null;
  }
  return { assets, liabilitiesAndEquity };
}

/**
 * The income statement or the balance sheet (props.kind): its lines from its report, each drawn by its kind, indented
 * by its level, with its amount. An account's name opens its statement. The rows come from the kind's report; the
 * page's state is in its URL (useReportPage). All props but kind come from the dashboard URL's search parameters, so
 * they are strings.
 *
 * @param {'income'|'balance'} props.kind  fixed by the page's URL (urlToComponentMap)
 */
export default function FinancialStatement({ kind, formId, formTitle, execute, requestTime, params }) {
  const statement = STATEMENTS[kind];
  const openLink = useOpenLink();
  const report = useReportPage({
    reportName: statement.reportName,
    page: statement.page,
    formId,
    formTitle: formTitle || statement.title,
    params,
    execute,
    requestTime,
    initialParams: statement.initialParams(),
  });
  const { rows } = report;
  const unbalanced = kind === 'balance' ? imbalance(rows) : null;

  /** An account's statement for the statement's period. Titled without its name, as in the trial balance. */
  const accountStatement = (row) => {
    const title = 'كشف حساب';
    const url = reportPageUrl('account-statement', title, {
      p_account_id: row.account_id, ...statement.statementPeriod(parseJsonObject(params, {})),
    });
    return { url, title };
  };

  return <ReportPageFrame report={report} emptyText={statement.emptyText}>
    <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
      {unbalanced && <Alert severity="error" sx={{ mb: 1, maxWidth: 720 }}>
        إجمالي الأصول ({formatAmount(unbalanced.assets)}) لا يساوي إجمالي الخصوم وحقوق الملكية
        ({formatAmount(unbalanced.liabilitiesAndEquity)}).
      </Alert>}
      <Table size="small" sx={{ maxWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={HEADER_CELL}>البند</TableCell>
            <TableCell sx={{ ...HEADER_CELL, width: 180 }}>المبلغ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const lineStyle = LINE_STYLES[row.line_kind] ?? {};
            const weight = row.is_parent ? { fontWeight: 600 } : {};
            const link = row.account_id != null ? accountStatement(row) : null;
            return <TableRow key={`${row.section}/${row.sort_path}`}>
              <TableCell sx={{ ...lineStyle, ...weight, paddingInlineStart: 2 + 3 * Number(row.level) }}>
                {link
                  ? <a href={link.url} target="_blank" rel="noopener noreferrer" title={`كشف حساب ${row.label}`}
                    onClick={(event) => openLinkOnPlainClick(event, openLink, link.url, link.title)}>{row.label}</a>
                  : row.label}
              </TableCell>
              <TableCell sx={{ ...lineStyle, ...weight, ...AMOUNT_CELL }}>
                <Amount>{formatStatementAmount(row.amount)}</Amount>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </Box>
  </ReportPageFrame>;
}
