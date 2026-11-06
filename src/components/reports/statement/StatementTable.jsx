'use client';

import { TableVirtuoso } from 'react-virtuoso';
import { TableCell, TableRow } from '@mui/material';
import { balanceColumns, statementLineColumns } from '@/utils/statement';
import { formatAmount } from '@/utils/decimals';
import { linkTarget } from '@/utils/reportutils';
import { openLinkOnPlainClick } from '@/utils/useOpenLink';
import {
  Amount, AMOUNT_CELL, FOOTER_CELL, HEADER_CELL, ResizableHeaderCell, ROW_HEIGHT, useColumnWidths,
  virtualTableComponents,
} from '../virtualTable';

// Each line's document: the page its row names (document_page), with its id (source_id)
const DOCUMENT_LINK = { documentColumn: 'document_page', idColumn: 'source_id' };
// Each line's journal entry, on the journal entry form
const ENTRY_LINK = { document: 'journal-entry', idColumn: 'entry_id', formTitle: 'قيد يومية' };

/** The opening row comes first (row_order 0); the others are the period's lines. */
const isOpeningRow = (row) => Number(row.row_order) === 0;

/** The two pairs of debit and credit columns: the line's own amount, and the balance after it. */
const GROUPS = [
  { key: 'movement', label: 'الحركة' },
  { key: 'balance', label: 'الرصيد' },
];

/**
 * The table's columns; a column in a group sits under the group's header. The account and party columns only where
 * the statement's lines need them (statementLineColumns).
 */
function statementColumns(showAccount, showParty) {
  return [
    { key: 'date', label: 'التاريخ', width: 150 },
    { key: 'entry', label: 'القيد', width: 70 },
    { key: 'document', label: 'المستند', width: 170 },
    { key: 'description', label: 'البيان', width: 300 },
    ...(showAccount ? [{ key: 'account', label: 'الحساب', width: 200 }] : []),
    ...(showParty ? [{ key: 'party', label: 'الطرف', width: 200 }] : []),
    { key: 'debit', label: 'مدين', width: 130, group: 'movement' },
    { key: 'credit', label: 'دائن', width: 130, group: 'movement' },
    { key: 'balance_debit', label: 'مدين', width: 130, group: 'balance' },
    { key: 'balance_credit', label: 'دائن', width: 130, group: 'balance' },
  ];
}

// The opening row stands out from the lines
const rowStyle = (row) => (row && isOpeningRow(row) ? { '& td': { fontWeight: 'bold', bgcolor: 'action.hover' } } : {});

// Made once: TableVirtuoso keeps its parts for the table's life (the widths come through its context)
const TABLE_COMPONENTS = virtualTableComponents(rowStyle);

/** A date-time cell without its seconds; the opening row's is only the from-date. */
function dateText(row) {
  const dateTime = row.entry_datetime ?? '';
  return isOpeningRow(row) ? dateTime.slice(0, 10) : dateTime.slice(0, 16);
}

/** An amount cell's text: empty for zero or none, so a line's one side stands out. */
function amountText(value) {
  return value === null || value === undefined || Number(value) === 0 ? '' : formatAmount(value);
}

/** A link that opens as a dashboard window on a plain click (see useOpenLink). */
function WindowLink({ target, openLink, children }) {
  return <a href={target.url} target="_blank" rel="noopener noreferrer"
    onClick={(event) => openLinkOnPlainClick(event, openLink, target.url, target.title)}>
    {children}
  </a>;
}

function DocumentCell({ row, openLink }) {
  if (isOpeningRow(row)) {
    return null;
  }
  const target = linkTarget(DOCUMENT_LINK, row);
  if (!target) {
    return 'قيد يدوي';
  }
  return <WindowLink target={target} openLink={openLink}>{`${target.title} ${row.source_id}`}</WindowLink>;
}

/** The line's entry number, which opens the entry with all its lines. */
function EntryCell({ row, openLink }) {
  const target = linkTarget(ENTRY_LINK, row);
  return target ? <WindowLink target={target} openLink={openLink}>{row.entry_id}</WindowLink> : null;
}

/** What each column shows for a row. */
function cellContent(column, row, openLink) {
  switch (column.key) {
    case 'date':
      return dateText(row);
    case 'entry':
      return <EntryCell row={row} openLink={openLink} />;
    case 'document':
      return <DocumentCell row={row} openLink={openLink} />;
    case 'description':
      return row.description;
    case 'account':
      return row.account_name;
    case 'party':
      return row.party_name;
    case 'debit':
      return amountText(row.debit);
    case 'credit':
      return amountText(row.credit);
    case 'balance_debit':
      return balanceColumns(row.balance).debit;
    case 'balance_credit':
      return balanceColumns(row.balance).credit;
    default:
      return null;
  }
}

const TEXT_CELL = { py: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** A cell's content; an amount (a grouped column) left to right (Amount). */
function CellText({ column, children }) {
  return column.group ? <Amount>{children}</Amount> : children;
}

/** The amount columns are the grouped ones. */
function cellStyle(column) {
  return column.group ? { ...AMOUNT_CELL, py: 0 } : TEXT_CELL;
}

/**
 * The two header rows: an ungrouped column's header spans both, a group's header spans its two columns, whose own
 * headers are on the second row. Each column's own header can resize it.
 */
function HeaderRows({ columns, columnWidths, onResize }) {
  const resizable = (column, cellProps = {}) => <ResizableHeaderCell key={column.key} columnKey={column.key}
    width={columnWidths[columns.indexOf(column)]} onResize={onResize} sx={HEADER_CELL} {...cellProps}>
    {column.label}
  </ResizableHeaderCell>;
  return <>
    <TableRow>
      {columns.filter((column) => !column.group).map((column) => resizable(column, { rowSpan: 2 }))}
      {GROUPS.map((group) => <TableCell key={group.key} colSpan={2} sx={HEADER_CELL}>{group.label}</TableCell>)}
    </TableRow>
    <TableRow>
      {columns.filter((column) => column.group).map((column) => resizable(column))}
    </TableRow>
  </>;
}

/**
 * The statement's lines (see virtualTable): the header and the total stay in place while the lines scroll, and the
 * user can resize the columns from their headers.
 *
 * @param {'account'|'supplier'|'customer'} props.kind  whose statement it is (StatementPage)
 * @param {string|number|null} props.subjectId  the account's, the supplier's or the customer's id the rows were run for
 * @param {Array<object>} props.rows  a statement report's rows: the opening row, then the lines
 * @param {{debit: string, credit: string, closing: string}|null} props.summary  statementSummary: the total row shows
 *   the period's debits and credits, and the closing balance in its debit or credit column
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export default function StatementTable({ kind, subjectId, rows, summary, openLink }) {
  const lines = rows.filter((row) => !isOpeningRow(row));
  const { showAccount, showParty } = statementLineColumns(kind, subjectId, lines);
  const columns = statementColumns(showAccount, showParty);
  const { columnWidths, resizeColumn } = useColumnWidths(columns);
  const closing = summary ? balanceColumns(summary.closing) : null;

  // The total under the lines: the period's debits and credits, and the closing balance
  const footerContent = (column) => {
    switch (column.key) {
      case 'description':
        return 'الإجمالي';
      case 'debit':
        return formatAmount(summary.debit);
      case 'credit':
        return formatAmount(summary.credit);
      case 'balance_debit':
        return closing.debit;
      case 'balance_credit':
        return closing.credit;
      default:
        return null;
    }
  };

  return <TableVirtuoso
    style={{ height: '100%' }}
    data={rows}
    components={TABLE_COMPONENTS}
    context={{ openLink, columnWidths }}
    fixedItemHeight={ROW_HEIGHT}
    computeItemKey={(index, row) => (isOpeningRow(row) ? 'opening' : row.line_id)}
    fixedHeaderContent={() => <HeaderRows columns={columns} columnWidths={columnWidths} onResize={resizeColumn} />}
    itemContent={(index, row, context) => columns.map((column) =>
      <TableCell key={column.key} data-column-key={column.key} sx={cellStyle(column)}>
        <CellText column={column}>{cellContent(column, row, context.openLink)}</CellText>
      </TableCell>)}
    fixedFooterContent={summary ? () => <TableRow>
      {columns.map((column) => <TableCell key={column.key} data-column-key={column.key}
        sx={{ ...FOOTER_CELL, ...(column.group ? AMOUNT_CELL : {}) }}>
        <CellText column={column}>{footerContent(column)}</CellText>
      </TableCell>)}
    </TableRow> : undefined}
  />;
}
