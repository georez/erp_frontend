'use client';

import { openLinkOnPlainClick } from '@/utils/useOpenLink';
import { buildLinkUrl, cellFilterNumber, compareDecimalCells } from '@/utils/reportutils';

// Numbers left to right inside the right-to-left grid, so a sign stays in front ("-7.5", not "7.5-"); still aligned as
// before (the grid aligns numeric cells with an absolute text-align)
const NUMBER_CELL = { direction: 'ltr' };

/** Defaults for every grid column; flex: 1 lets the columns share the available width. */
export const DEFAULT_COLUMN_DEF = {
  minWidth: 100,
  resizable: true,
  sortable: true,
  filter: true,
  flex: 1,
};

/**
 * The backend's column list as the result grid's columns. Width, filtering, sorting and resizing are left to the grid
 * defaults (DEFAULT_COLUMN_DEF).
 *
 * @param {Array<{name: string, label?: string, inputType?: string, link?: object}>} backendColumns
 * @returns {Array<{field: string, headerName: string, visibleByDefault: boolean, numeric: boolean, link: object|null}>}
 */
export function toGridColumns(backendColumns) {
  return backendColumns.map((column) => ({
    field: column.name,
    headerName: column.label ?? column.name,
    visibleByDefault: true,
    numeric: column.inputType === 'number',
    link: column.link ?? null,
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
  const url = buildLinkUrl(link, data);
  if (!url) {
    return text;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer"
    onClick={(event) => openLinkOnPlainClick(event, openLink, url, link.formTitle)}>
    {text}
  </a>;
}

/** What makes a number column exact: numeric and bigint come as decimal text, sorted and filtered by value. */
const NUMBER_COLUMN_DEF = {
  type: 'numericColumn',
  cellStyle: NUMBER_CELL,
  // Shown as sent; the grid mustn't guess the column's type from the text
  cellDataType: false,
  comparator: compareDecimalCells,
  filter: 'agNumberColumnFilter',
  filterValueGetter: ({ data, colDef }) => cellFilterNumber(data[colDef.field]),
};

/**
 * AG Grid column definitions; hidden columns stay defined (with hide), so showing them again needs no new data.
 *
 * @param openLink opens a linked cell as a dashboard window (useOpenLink), or null for a new tab
 */
export function gridColumnDefs(reportColumns, visibleColumns, openLink) {
  return reportColumns.map((column) => ({
    field: column.field,
    headerName: column.headerName,
    type: null,
    ...(column.numeric && NUMBER_COLUMN_DEF),
    hide: visibleColumns[column.field] === false,
    ...(column.link && {
      cellRenderer: LinkCell,
      cellRendererParams: { link: column.link, openLink },
    }),
  }));
}
