'use client';

import { forwardRef, useState } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow } from '@mui/material';

/*
 * The parts of a report page's table (react-virtuoso's TableVirtuoso drawing MUI's Table): only the rows in view are
 * drawn, the header and the footer stay in place while the rows scroll under them, and the whole table scrolls
 * sideways when it's wider than its window. The columns have widths the user can change (ResizableHeaderCell); the
 * table reads them from TableVirtuoso's context ({ columnWidths }), so the header, the rows and the footer line up.
 */

export const ROW_HEIGHT = 36;

// Amounts aligned on their last digit, so their decimal points line up: on the cell's start, its right edge (the
// cell is right to left like the page). Not direction: 'ltr' or textAlign: 'right' here: the app's RTL style plugin
// flips both (to rtl and left); it leaves 'start' alone. The number itself is left to right through <Amount>.
export const AMOUNT_CELL = {
  textAlign: 'start', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
};

/** An amount's text, left to right inside its right to left cell, so a sign stays in front ("-7.50"). */
export function Amount({ children }) {
  return <bdi dir="ltr">{children}</bdi>;
}
// The header and the footer cover the rows scrolling under them
const STICKY_CELL = { backgroundColor: 'background.paper' };
export const HEADER_CELL = { ...STICKY_CELL, fontWeight: 'bold', textAlign: 'center', py: 0.75 };
export const FOOTER_CELL = {
  ...STICKY_CELL, color: 'text.primary', fontWeight: 'bold', fontSize: '0.875rem', borderTop: 2,
  borderTopColor: 'divider',
};

const MIN_COLUMN_WIDTH = 48;

// On the column's far edge (inline-end: the left one, right to left), over the border between two columns
const RESIZE_HANDLE = {
  position: 'absolute', top: 0, bottom: 0, insetInlineEnd: -4, width: 8, zIndex: 1, cursor: 'col-resize',
  touchAction: 'none', '&:hover': { bgcolor: 'action.selected' },
};

// TableVirtuoso gives every part its context; it's for the parts, not for the DOM elements they draw

const Scroller = forwardRef(function Scroller({ context, ...props }, ref) {
  return <TableContainer {...props} ref={ref} />;
});

const VirtualTableHead = forwardRef(function VirtualTableHead({ context, ...props }, ref) {
  return <TableHead {...props} ref={ref} />;
});

const VirtualTableBody = forwardRef(function VirtualTableBody({ context, ...props }, ref) {
  return <TableBody {...props} ref={ref} />;
});

const VirtualTableFoot = forwardRef(function VirtualTableFoot({ context, ...props }, ref) {
  return <TableFooter {...props} ref={ref} />;
});

/**
 * TableVirtuoso's components for a table whose column widths are in its context ({ columnWidths }, in px, in the
 * columns' order). Made once per table, at module level.
 *
 * @param {Function} [rowSx]  a row's extra style, from its item (e.g. bold for a parent account)
 * @param {object} [tableSx]  the table's extra style (e.g. CSS variables its cells use)
 */
export function virtualTableComponents(rowSx = () => undefined, tableSx = {}) {
  function VirtualTable({ context, children, ...props }) {
    const columnWidths = context.columnWidths;
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    return <Table {...props} size="small"
      sx={{ tableLayout: 'fixed', width: tableWidth, borderCollapse: 'separate', ...tableSx }}>
      <colgroup>
        {columnWidths.map((width, index) => <col key={`column-${index}`} style={{ width }} />)}
      </colgroup>
      {children}
    </Table>;
  }

  function VirtualTableRow({ item, context, ...props }) {
    return <TableRow {...props} hover sx={{ height: ROW_HEIGHT, ...rowSx(item) }} />;
  }

  return {
    Scroller,
    Table: VirtualTable,
    TableHead: VirtualTableHead,
    TableBody: VirtualTableBody,
    TableFoot: VirtualTableFoot,
    TableRow: VirtualTableRow,
  };
}

/**
 * The widths of a table's columns: each column's own width until the user resizes it. Kept by column key, so a column
 * keeps its width when others come and go.
 *
 * @param {Array<{key: string, width: number}>} columns  in order
 * @returns {{columnWidths: number[], resizeColumn: Function}}  the widths in the columns' order, and
 *   resizeColumn(key, width)
 */
export function useColumnWidths(columns) {
  const [resized, setResized] = useState({});
  const columnWidths = columns.map((column) => resized[column.key] ?? column.width);
  const resizeColumn = (key, width) => {
    setResized((previous) => ({ ...previous, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));
  };
  return { columnWidths, resizeColumn };
}

// The browser measures overflow in whole pixels while text has fractions of one: without this slack a fitted column
// can still cut the last letter of its widest text
const FIT_SLACK = 4;

/**
 * The width a column needs to show all its drawn cells (the header and the rows in view) without cutting their text:
 * each cell's width plus whatever overflows it or any element inside it (e.g. a name ending in "...").
 */
function widthToFit(table, columnKey) {
  let needed = MIN_COLUMN_WIDTH;
  for (const cell of table.querySelectorAll(`[data-column-key="${columnKey}"]`)) {
    let overflow = cell.scrollWidth - cell.clientWidth;
    for (const element of cell.querySelectorAll('*')) {
      overflow = Math.max(overflow, element.scrollWidth - element.clientWidth);
    }
    needed = Math.max(needed, Math.ceil(cell.getBoundingClientRect().width) + overflow + FIT_SLACK);
  }
  return needed;
}

/**
 * A header cell whose column the user can resize: drag the handle on its far edge (the left one, right to left), or
 * double-click it to fit the column to its widest drawn cell. The column's cells carry data-column-key, for fitting.
 *
 * @param {string} props.columnKey
 * @param {number} props.width  the column's current width
 * @param {Function} props.onResize  (key, width) => void
 */
export function ResizableHeaderCell({ columnKey, width, onResize, sx, children, ...cellProps }) {
  const startDrag = (event) => {
    event.preventDefault();
    const table = event.currentTarget.closest('table');
    const rightToLeft = getComputedStyle(table).direction === 'rtl';
    const startX = event.clientX;
    const move = (moveEvent) => {
      const dragged = rightToLeft ? startX - moveEvent.clientX : moveEvent.clientX - startX;
      onResize(columnKey, width + dragged);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const fit = (event) => {
    onResize(columnKey, widthToFit(event.currentTarget.closest('table'), columnKey));
  };

  return <TableCell {...cellProps} data-column-key={columnKey} sx={{ ...sx, position: 'relative' }}>
    {children}
    <Box component="span" role="separator" aria-orientation="vertical" aria-label="تغيير عرض العمود"
      title="اسحب لتغيير العرض، أو انقر مرتين للملاءمة" onPointerDown={startDrag} onDoubleClick={fit}
      sx={RESIZE_HANDLE} />
  </TableCell>;
}
