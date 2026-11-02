'use client';

import { openLinkOnPlainClick } from '@/utils/useOpenLink';
import { formatAmount } from '@/utils/decimals';
import { linkTarget, totalsRow } from '@/utils/reportutils';

// Numbers left to right inside the right-to-left grid, so a sign stays in front ("-7.5", not "7.5-"); still aligned as
// before (the grid aligns numeric cells with an absolute text-align)
const NUMBER_CELL = { direction: 'ltr' };

// How far each level of an indented column (indentBy) moves its cells in
const INDENT_STEP_EM = 1.5;

/**
 * Defaults for every grid column. No flex: each column is as wide as its content (AUTO_SIZE_STRATEGY), and the grid
 * scrolls sideways when the columns don't fit. The grid doesn't sort or filter: the sort tab and the query builder do
 * that in the backend, so the rows (and the total row) are always what the report returned.
 */
export const DEFAULT_COLUMN_DEF = {
  minWidth: 60,
  resizable: true,
  sortable: false,
  filter: false,
};

/** The total row (pinned under the rows) is bold. */
export function totalRowStyle({ node }) {
  return node.rowPinned === 'bottom' ? { fontWeight: 'bold' } : undefined;
}

/**
 * The rows to pin under the grid's rows: the report's total row (its metadata's totals) over the rows the report
 * returned (after the query builder's filters), or none when the report has no totals or no rows.
 *
 * @param {Array<object>} rows
 * @param {object|null} totals
 * @returns {Array<object>}
 */
export function pinnedTotalRows(rows, totals) {
  if (!totals || rows.length === 0) {
    return [];
  }
  return [totalsRow(rows, totals)];
}

/** The grid sizes each column to fit its header and cells once the first rows are shown. */
export const AUTO_SIZE_STRATEGY = { type: 'fitCellContents' };

/**
 * Sizes the columns to the rows now in the grid: after a run's rows replace the old ones (the auto-size strategy only
 * sizes the first rows), and for a column the user shows again. The grid measures rendered cells, so this waits for
 * them to be drawn.
 *
 * @param {object} event  an AG Grid event (its api), e.g. rowDataUpdated or columnVisible
 */
export function autoSizeColumns({ api, columns }) {
  setTimeout(() => {
    if (api.isDestroyed()) {
      return;
    }
    const shown = columns?.filter((column) => column.isVisible());
    if (shown) {
      api.autoSizeColumns(shown);
    } else {
      api.autoSizeAllColumns();
    }
  });
}

/**
 * The backend's column list as the result grid's columns. Width (auto-sized) and resizing are left to the grid
 * defaults (DEFAULT_COLUMN_DEF). An internal column (a link's document page, a tree level) isn't one of them: the
 * rows still carry its values, which the links, the indent and the totals read, but it's never offered.
 *
 * @param {Array<{name: string, label?: string, inputType?: string, link?: object, indentBy?: string,
 *   hidden?: boolean, internal?: boolean}>} backendColumns
 * @returns {Array<{field: string, headerName: string, visibleByDefault: boolean, numeric: boolean, link: object|null,
 *   indentBy: string|null, sortable: boolean, format: string|null}>}  sortable: offered in the sort tab (not the
 *   grid's own sorting)
 */
export function toGridColumns(backendColumns) {
  return backendColumns.filter((column) => column.internal !== true).map((column) => ({
    field: column.name,
    headerName: column.label ?? column.name,
    visibleByDefault: column.hidden !== true,
    numeric: column.inputType === 'number',
    link: column.link ?? null,
    indentBy: column.indentBy ?? null,
    sortable: column.sortable === true,
    format: column.format ?? null,
  }));
}

/**
 * Visibility for a freshly loaded column list: keeps the user's current choice for columns that still exist, and uses
 * each new column's default otherwise.
 *
 * @param {Object<string, boolean>} previous  current visibility, keyed by column field
 * @param {Array<{field: string, visibleByDefault?: boolean}>} columns
 * @returns {Object<string, boolean>}
 */
export function mergeColumnVisibility(previous, columns) {
  return Object.fromEntries(columns.map((column) => {
    const chosen = Object.prototype.hasOwnProperty.call(previous, column.field);
    return [column.field, chosen ? previous[column.field] : column.visibleByDefault !== false];
  }));
}

/**
 * Grid cell of a linked column: opens the record the row points to (see the column's link in the report metadata), as
 * a new dashboard window or a new browser tab (see useOpenLink).
 *
 * @param {object} props  AG Grid cell renderer props, plus cellRendererParams `link` and `openLink`
 */
function LinkCell({ value, data, link, openLink }) {
  const text = value === null || value === undefined ? '' : String(value);
  const target = linkTarget(link, data);
  if (!target) {
    return text;
  }
  return <a href={target.url} target="_blank" rel="noopener noreferrer"
    onClick={(event) => openLinkOnPlainClick(event, openLink, target.url, target.title)}>
    {text}
  </a>;
}

/**
 * The cell style of an indented column: the grid's own cell padding plus one step per level, taken from the row's
 * levelField (a number, or decimal text for a bigint). A row without a level isn't indented.
 *
 * @param {string} levelField  the column holding each row's level (the column's indentBy)
 * @param {object} [baseStyle]  the column's style without the indent
 */
function indentedCellStyle(levelField, baseStyle = {}) {
  return ({ data }) => {
    const level = Number(data?.[levelField]);
    if (!Number.isFinite(level) || level <= 0) {
      return baseStyle;
    }
    return {
      ...baseStyle,
      paddingInlineStart: `calc(var(--ag-cell-horizontal-padding, 16px) + ${level * INDENT_STEP_EM}em)`,
    };
  };
}

/** A number column: aligned as numbers. Numeric and bigint come as decimal text, shown as sent unless formatted. */
const NUMBER_COLUMN_DEF = {
  type: 'numericColumn',
  cellStyle: NUMBER_CELL,
  // The grid mustn't guess the column's type from the text
  cellDataType: false,
};

/**
 * AG Grid column definitions; hidden columns stay defined (with hide), so showing them again needs no new data.
 *
 * @param openLink opens a linked cell as a dashboard window (useOpenLink), or null for a new tab
 */
export function gridColumnDefs(reportColumns, visibleColumns, openLink) {
  return reportColumns.map((column) => {
    const columnDef = {
      field: column.field,
      headerName: column.headerName,
      type: null,
      ...(column.numeric && NUMBER_COLUMN_DEF),
      hide: visibleColumns[column.field] === false,
      ...(column.link && {
        cellRenderer: LinkCell,
        cellRendererParams: { link: column.link, openLink },
      }),
    };
    if (column.indentBy) {
      columnDef.cellStyle = indentedCellStyle(column.indentBy, columnDef.cellStyle);
    }
    if (column.format === 'amount') {
      // Only what's shown: the rows keep the exact value (the total row adds those up)
      columnDef.valueFormatter = ({ value }) => formatAmount(value);
    }
    return columnDef;
  });
}
