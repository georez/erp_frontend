'use client';

import { TableVirtuoso } from 'react-virtuoso';
import { TableCell, TableRow } from '@mui/material';
import { formatAmount } from '@/utils/decimals';
import { ACCOUNT_TREE_TABLE_COMPONENTS, AccountTreeCell } from '../accountTree/AccountTree';
import {
  Amount, AMOUNT_CELL, FOOTER_CELL, HEADER_CELL, ResizableHeaderCell, ROW_HEIGHT, useColumnWidths,
} from '../virtualTable';

/** The amount columns, in order, under their group headers. */
const AMOUNT_GROUPS = [
  { label: 'رصيد أول المدة', debit: 'opening_debit', credit: 'opening_credit' },
  { label: 'حركة الفترة', debit: 'period_debit', credit: 'period_credit' },
  { label: 'رصيد آخر المدة', debit: 'closing_debit', credit: 'closing_credit' },
];
const AMOUNT_COLUMNS = AMOUNT_GROUPS.flatMap((group) => [group.debit, group.credit]);

// Number, account, then the amounts: their widths until the user resizes them
const COLUMNS = [
  { key: 'account_id', width: 72 },
  { key: 'account_name', width: 380 },
  ...AMOUNT_COLUMNS.map((column) => ({ key: column, width: 140 })),
];

/** An amount cell's text: empty for zero, so the accounts' real amounts stand out. */
function amountText(value) {
  return Number(value) === 0 ? '' : formatAmount(value);
}

/** The two header rows: each column's own cell can resize it (the amount groups' cells span two columns). */
function HeaderRows({ widthOf, onResize }) {
  const resizable = (key, label, cellProps = {}) => <ResizableHeaderCell key={key} columnKey={key}
    width={widthOf(key)} onResize={onResize} sx={HEADER_CELL} {...cellProps}>{label}</ResizableHeaderCell>;
  return <>
    <TableRow>
      {resizable('account_id', 'رقم', { rowSpan: 2 })}
      {resizable('account_name', 'الحساب', { rowSpan: 2 })}
      {AMOUNT_GROUPS.map((group) => <TableCell key={group.label} colSpan={2} sx={HEADER_CELL}>{group.label}</TableCell>)}
    </TableRow>
    <TableRow>
      {AMOUNT_GROUPS.map((group) => [resizable(group.debit, 'مدين'), resizable(group.credit, 'دائن')])}
    </TableRow>
  </>;
}

function AccountRowCells({ item, context }) {
  const { row } = item;
  return <>
    <TableCell data-column-key="account_id" sx={{ py: 0 }}>{row.account_id}</TableCell>
    <TableCell data-column-key="account_name" sx={{ py: 0, height: ROW_HEIGHT }}>
      <AccountTreeCell item={item} onToggle={context.onToggle} statementLink={context.statementLink}
        openLink={context.openLink} />
    </TableCell>
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column} sx={{ ...AMOUNT_CELL, py: 0 }}>
      <Amount>{amountText(row[column])}</Amount>
    </TableCell>)}
  </>;
}

function TotalRow({ total }) {
  return <TableRow>
    <TableCell sx={FOOTER_CELL} />
    <TableCell sx={FOOTER_CELL}>{total.account_name}</TableCell>
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column}
      sx={{ ...FOOTER_CELL, ...AMOUNT_CELL }}>
      <Amount>{formatAmount(total[column])}</Amount>
    </TableCell>)}
  </TableRow>;
}

/**
 * The trial balance as a tree table (see virtualTable): the header and the total stay in place while the rows scroll,
 * and the user can resize the columns from their headers.
 *
 * @param {Array<object>} props.items  the rows to show (visibleTreeRows)
 * @param {object|null} props.total  the total row (totalsRow), or null for none
 * @param {Function} props.onToggle  expands or collapses an account, by id
 * @param {Function} props.statementLink  an account row's statement for the same period: { url, title }
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export default function TrialBalanceTable({ items, total, onToggle, statementLink, openLink }) {
  const { columnWidths, resizeColumn } = useColumnWidths(COLUMNS);
  const widthOf = (key) => columnWidths[COLUMNS.findIndex((column) => column.key === key)];

  return <TableVirtuoso
    style={{ height: '100%' }}
    data={items}
    components={ACCOUNT_TREE_TABLE_COMPONENTS}
    context={{ onToggle, statementLink, openLink, columnWidths }}
    fixedItemHeight={ROW_HEIGHT}
    computeItemKey={(index, item) => item.row.account_id}
    fixedHeaderContent={() => <HeaderRows widthOf={widthOf} onResize={resizeColumn} />}
    itemContent={(index, item, context) => <AccountRowCells item={item} context={context} />}
    fixedFooterContent={total ? () => <TotalRow total={total} /> : undefined}
  />;
}
