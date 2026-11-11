'use client';

import { useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { TableCell, TableRow } from '@mui/material';
import { formatAmount } from '@/utils/decimals';
import { openLinkOnPlainClick } from '@/utils/useOpenLink';
import {
  Amount, AMOUNT_CELL, FOOTER_CELL, HEADER_CELL, ResizableHeaderCell, ROW_HEIGHT, useColumnWidths,
  virtualTableComponents,
} from '../virtualTable';

/** The amount columns, in order, under their group headers. */
const AMOUNT_GROUPS = [
  { label: 'رصيد أول المدة', debit: 'opening_debit', credit: 'opening_credit' },
  { label: 'حركة الفترة', debit: 'period_debit', credit: 'period_credit' },
  { label: 'رصيد آخر المدة', debit: 'closing_debit', credit: 'closing_credit' },
];
const AMOUNT_COLUMNS = AMOUNT_GROUPS.flatMap((group) => [group.debit, group.credit]);

/** Number, party, category, then the amounts: their widths until the user resizes them. */
const columnsOf = ({ idKey, nameKey }) => [
  { key: idKey, width: 72 },
  { key: nameKey, width: 260 },
  { key: 'category_name', width: 160 },
  ...AMOUNT_COLUMNS.map((column) => ({ key: column, width: 140 })),
];

// Made once: TableVirtuoso keeps its parts for the table's life (the widths come through its context)
const TABLE_COMPONENTS = virtualTableComponents();

const TEXT_CELL = { py: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** An amount cell's text: empty for zero, so the parties' real amounts stand out. */
function amountText(value) {
  return Number(value) === 0 ? '' : formatAmount(value);
}

/** The two header rows: each column's own cell can resize it (the amount groups' cells span two columns). */
function HeaderRows({ columns, widthOf, onResize }) {
  const resizable = (key, label, cellProps = {}) => <ResizableHeaderCell key={key} columnKey={key}
    width={widthOf(key)} onResize={onResize} sx={HEADER_CELL} {...cellProps}>{label}</ResizableHeaderCell>;
  return <>
    <TableRow>
      {resizable(columns.idKey, 'رقم', { rowSpan: 2 })}
      {resizable(columns.nameKey, columns.nameHeader, { rowSpan: 2 })}
      {resizable('category_name', 'التصنيف', { rowSpan: 2 })}
      {AMOUNT_GROUPS.map((group) => <TableCell key={group.label} colSpan={2} sx={HEADER_CELL}>{group.label}</TableCell>)}
    </TableRow>
    <TableRow>
      {AMOUNT_GROUPS.map((group) => [resizable(group.debit, 'مدين'), resizable(group.credit, 'دائن')])}
    </TableRow>
  </>;
}

/** A party's row: its name opens its statement for the same period. */
function PartyRowCells({ row, context }) {
  const { idKey, nameKey, statementTitle } = context.columns;
  const statement = context.statementLink(row);
  return <>
    <TableCell data-column-key={idKey} sx={TEXT_CELL}>{row[idKey]}</TableCell>
    <TableCell data-column-key={nameKey} sx={TEXT_CELL} title={`${statementTitle} ${row[nameKey]}`}>
      <a href={statement.url} target="_blank" rel="noopener noreferrer"
        onClick={(event) => openLinkOnPlainClick(event, context.openLink, statement.url, statement.title)}>
        {row[nameKey]}
      </a>
    </TableCell>
    <TableCell data-column-key="category_name" sx={TEXT_CELL}>{row.category_name}</TableCell>
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column} sx={{ ...AMOUNT_CELL, py: 0 }}>
      <Amount>{amountText(row[column])}</Amount>
    </TableCell>)}
  </>;
}

function TotalRow({ total, nameKey }) {
  return <TableRow>
    <TableCell sx={FOOTER_CELL} />
    <TableCell sx={FOOTER_CELL}>{total[nameKey]}</TableCell>
    <TableCell sx={FOOTER_CELL} />
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column}
      sx={{ ...FOOTER_CELL, ...AMOUNT_CELL }}>
      <Amount>{formatAmount(total[column])}</Amount>
    </TableCell>)}
  </TableRow>;
}

/**
 * The suppliers' or customers' balances (see virtualTable): the header and the total stay in place while the rows
 * scroll, and the user can resize the columns from their headers.
 *
 * @param {Array<object>} props.rows  the balances report's rows
 * @param {object|null} props.total  the total row (totalsRow), or null for none
 * @param {{ idKey: string, nameKey: string, nameHeader: string, statementTitle: string }} props.columns  the kind's
 *   id and name columns, the name's header ("المورد"), and its statement's title
 * @param {Function} props.statementLink  a row's statement for the same period: { url, title }
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export default function PartyBalancesTable({ rows, total, columns, statementLink, openLink }) {
  const tableColumns = useMemo(() => columnsOf(columns), [columns]);
  const { columnWidths, resizeColumn } = useColumnWidths(tableColumns);
  const widthOf = (key) => columnWidths[tableColumns.findIndex((column) => column.key === key)];

  return <TableVirtuoso
    style={{ height: '100%' }}
    data={rows}
    components={TABLE_COMPONENTS}
    context={{ columns, statementLink, openLink, columnWidths }}
    fixedItemHeight={ROW_HEIGHT}
    computeItemKey={(index, row) => row[columns.idKey]}
    fixedHeaderContent={() => <HeaderRows columns={columns} widthOf={widthOf} onResize={resizeColumn} />}
    itemContent={(index, row, context) => <PartyRowCells row={row} context={context} />}
    fixedFooterContent={total ? () => <TotalRow total={total} nameKey={columns.nameKey} /> : undefined}
  />;
}
