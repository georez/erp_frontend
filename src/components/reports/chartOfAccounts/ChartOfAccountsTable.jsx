'use client';

import { TableVirtuoso } from 'react-virtuoso';
import { TableCell, TableRow } from '@mui/material';
import { ACCOUNT_TREE_TABLE_COMPONENTS, AccountTreeCell } from '../accountTree/AccountTree';
import { HEADER_CELL, ResizableHeaderCell, ROW_HEIGHT, useColumnWidths } from '../virtualTable';

// Number and account: their widths until the user resizes them
const COLUMNS = [
  { key: 'account_id', width: 72 },
  { key: 'account_name', width: 480 },
];

function HeaderRow({ widthOf, onResize }) {
  const resizable = (key, label) => <ResizableHeaderCell key={key} columnKey={key} width={widthOf(key)}
    onResize={onResize} sx={HEADER_CELL}>{label}</ResizableHeaderCell>;
  return <TableRow>
    {resizable('account_id', 'رقم')}
    {resizable('account_name', 'الحساب')}
  </TableRow>;
}

function AccountRowCells({ item, context }) {
  return <>
    <TableCell data-column-key="account_id" sx={{ py: 0 }}>{item.row.account_id}</TableCell>
    <TableCell data-column-key="account_name" sx={{ py: 0, height: ROW_HEIGHT }}>
      <AccountTreeCell item={item} onToggle={context.onToggle} statementLink={context.statementLink}
        openLink={context.openLink} />
    </TableCell>
  </>;
}

/**
 * The chart of accounts as a tree table (see virtualTable): the header stays in place while the rows scroll, and the
 * user can resize the columns from their headers.
 *
 * @param {Array<object>} props.items  the rows to show (visibleTreeRows)
 * @param {Function} props.onToggle  expands or collapses an account, by id
 * @param {Function} props.statementLink  an account row's statement: { url, title }
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export default function ChartOfAccountsTable({ items, onToggle, statementLink, openLink }) {
  const { columnWidths, resizeColumn } = useColumnWidths(COLUMNS);
  const widthOf = (key) => columnWidths[COLUMNS.findIndex((column) => column.key === key)];

  return <TableVirtuoso
    style={{ height: '100%' }}
    data={items}
    components={ACCOUNT_TREE_TABLE_COMPONENTS}
    context={{ onToggle, statementLink, openLink, columnWidths }}
    fixedItemHeight={ROW_HEIGHT}
    computeItemKey={(index, item) => item.row.account_id}
    fixedHeaderContent={() => <HeaderRow widthOf={widthOf} onResize={resizeColumn} />}
    itemContent={(index, item, context) => <AccountRowCells item={item} context={context} />}
  />;
}
