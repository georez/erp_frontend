'use client';

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

// Number, supplier, category, then the amounts: their widths until the user resizes them
const COLUMNS = [
  { key: 'supplier_id', width: 72 },
  { key: 'supplier_name', width: 260 },
  { key: 'category_name', width: 160 },
  ...AMOUNT_COLUMNS.map((column) => ({ key: column, width: 140 })),
];

// Made once: TableVirtuoso keeps its parts for the table's life (the widths come through its context)
const TABLE_COMPONENTS = virtualTableComponents();

const TEXT_CELL = { py: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** An amount cell's text: empty for zero, so the suppliers' real amounts stand out. */
function amountText(value) {
  return Number(value) === 0 ? '' : formatAmount(value);
}

/** The two header rows: each column's own cell can resize it (the amount groups' cells span two columns). */
function HeaderRows({ widthOf, onResize }) {
  const resizable = (key, label, cellProps = {}) => <ResizableHeaderCell key={key} columnKey={key}
    width={widthOf(key)} onResize={onResize} sx={HEADER_CELL} {...cellProps}>{label}</ResizableHeaderCell>;
  return <>
    <TableRow>
      {resizable('supplier_id', 'رقم', { rowSpan: 2 })}
      {resizable('supplier_name', 'المورد', { rowSpan: 2 })}
      {resizable('category_name', 'التصنيف', { rowSpan: 2 })}
      {AMOUNT_GROUPS.map((group) => <TableCell key={group.label} colSpan={2} sx={HEADER_CELL}>{group.label}</TableCell>)}
    </TableRow>
    <TableRow>
      {AMOUNT_GROUPS.map((group) => [resizable(group.debit, 'مدين'), resizable(group.credit, 'دائن')])}
    </TableRow>
  </>;
}

/** A supplier's row: its name opens its statement for the same period. */
function SupplierRowCells({ row, context }) {
  const statement = context.statementLink(row);
  return <>
    <TableCell data-column-key="supplier_id" sx={TEXT_CELL}>{row.supplier_id}</TableCell>
    <TableCell data-column-key="supplier_name" sx={TEXT_CELL} title={`كشف حساب مورد ${row.supplier_name}`}>
      <a href={statement.url} target="_blank" rel="noopener noreferrer"
        onClick={(event) => openLinkOnPlainClick(event, context.openLink, statement.url, statement.title)}>
        {row.supplier_name}
      </a>
    </TableCell>
    <TableCell data-column-key="category_name" sx={TEXT_CELL}>{row.category_name}</TableCell>
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column} sx={{ ...AMOUNT_CELL, py: 0 }}>
      <Amount>{amountText(row[column])}</Amount>
    </TableCell>)}
  </>;
}

function TotalRow({ total }) {
  return <TableRow>
    <TableCell sx={FOOTER_CELL} />
    <TableCell sx={FOOTER_CELL}>{total.supplier_name}</TableCell>
    <TableCell sx={FOOTER_CELL} />
    {AMOUNT_COLUMNS.map((column) => <TableCell key={column} data-column-key={column}
      sx={{ ...FOOTER_CELL, ...AMOUNT_CELL }}>
      <Amount>{formatAmount(total[column])}</Amount>
    </TableCell>)}
  </TableRow>;
}

/**
 * The suppliers' balances (see virtualTable): the header and the total stay in place while the rows scroll, and the
 * user can resize the columns from their headers.
 *
 * @param {Array<object>} props.rows  supplierBalancesReport's rows
 * @param {object|null} props.total  the total row (totalsRow), or null for none
 * @param {Function} props.statementLink  a supplier row's statement for the same period: { url, title }
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export default function SupplierBalancesTable({ rows, total, statementLink, openLink }) {
  const { columnWidths, resizeColumn } = useColumnWidths(COLUMNS);
  const widthOf = (key) => columnWidths[COLUMNS.findIndex((column) => column.key === key)];

  return <TableVirtuoso
    style={{ height: '100%' }}
    data={rows}
    components={TABLE_COMPONENTS}
    context={{ statementLink, openLink, columnWidths }}
    fixedItemHeight={ROW_HEIGHT}
    computeItemKey={(index, row) => row.supplier_id}
    fixedHeaderContent={() => <HeaderRows widthOf={widthOf} onResize={resizeColumn} />}
    itemContent={(index, row, context) => <SupplierRowCells row={row} context={context} />}
    fixedFooterContent={total ? () => <TotalRow total={total} /> : undefined}
  />;
}
