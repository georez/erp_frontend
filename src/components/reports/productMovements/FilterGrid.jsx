'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Box } from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { Big } from 'bigdecimal.js';
import { formatAmount } from '@/utils/decimals';
import { DATE_SHOWN, DATE_TIME_SHOWN } from '@/components/ui/DateTimeFields';
import { AUTO_SIZE_STRATEGY, autoSizeColumns, LinkCell, totalRowStyle } from '../reportGrid';

const modules = [AllCommunityModule];

// Numbers left to right inside the right-to-left grid, so a sign stays in front
const NUMBER_CELL = { direction: 'ltr' };

/**
 * Unlike the report screen's grid (whose sort tab and query builder work in the backend), every column sorts and
 * filters here, in the browser: the rows are one product's, all of them already loaded. Each column has its filter
 * under its header.
 */
const DEFAULT_COLUMN_DEF = {
  minWidth: 60,
  resizable: true,
  sortable: true,
  filter: true,
  floatingFilter: true,
};

// The grid's filter menus in Arabic
const LOCALE_TEXT = {
  contains: 'يحتوي على',
  notContains: 'لا يحتوي على',
  equals: 'يساوي',
  notEqual: 'لا يساوي',
  startsWith: 'يبدأ بـ',
  endsWith: 'ينتهي بـ',
  blank: 'فارغ',
  notBlank: 'غير فارغ',
  lessThan: 'أقل من',
  greaterThan: 'أكبر من',
  lessThanOrEqual: 'أقل من أو يساوي',
  greaterThanOrEqual: 'أكبر من أو يساوي',
  inRange: 'بين',
  inRangeStart: 'من',
  inRangeEnd: 'إلى',
  andCondition: 'و',
  orCondition: 'أو',
  filterOoo: 'تصفية...',
  empty: 'اختر',
  noRowsToShow: 'لا توجد صفوف',
};

const isEmpty = (value) => value === null || value === undefined || value === '';

/** Numbers come as decimal text: compared exactly, empty cells first. */
function compareDecimals(first, second) {
  if (isEmpty(first) || isEmpty(second)) {
    return Number(isEmpty(second)) - Number(isEmpty(first));
  }
  return Big(String(first)).compareTo(Big(String(second)));
}

/** A date (or date-time) cell as the app shows dates; anything else (a total row's label) as it is. */
function dateText(value, shown) {
  if (isEmpty(value)) {
    return '';
  }
  return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? dayjs(value).format(shown) : String(value);
}

/** The total row and the rows pinned above are bold. */
const pinnedRowStyle = (params) => totalRowStyle(params) ?? (params.node.rowPinned === 'top'
  ? { fontWeight: 'bold' } : undefined);

/**
 * A grid column for a report column (as the report's metadata describes it: its label, type, link and format). A date
 * is filtered by the text it shows (e.g. "/11/2026"): the app's dates are typed in its own pickers, never in a
 * browser's date input.
 */
function columnDef(column, openLink) {
  const def = { field: column.name, headerName: column.label ?? column.name };
  if (column.inputType === 'number') {
    Object.assign(def, {
      type: 'numericColumn',
      cellStyle: NUMBER_CELL,
      // The grid mustn't guess the column's type from the text
      cellDataType: false,
      comparator: compareDecimals,
      filter: 'agNumberColumnFilter',
      filterValueGetter: ({ data }) => (isEmpty(data[column.name]) ? null : Number(data[column.name])),
    });
    if (column.format === 'amount') {
      def.valueFormatter = ({ value }) => formatAmount(value);
    }
  } else if (column.inputType === 'date' || column.inputType === 'datetime-local') {
    const shown = column.inputType === 'date' ? DATE_SHOWN : DATE_TIME_SHOWN;
    Object.assign(def, {
      cellStyle: NUMBER_CELL,
      cellDataType: false,
      valueFormatter: ({ value }) => dateText(value, shown),
      filter: 'agTextColumnFilter',
      filterValueGetter: ({ data }) => dateText(data[column.name], shown),
    });
  } else {
    Object.assign(def, { cellDataType: false, filter: 'agTextColumnFilter' });
  }
  if (column.link) {
    Object.assign(def, { cellRenderer: LinkCell, cellRendererParams: { link: column.link, openLink } });
  }
  return def;
}

/**
 * A grid of rows that sorts and filters by any column, with a total row under them over the rows the filters leave
 * (totalRow), and optionally rows pinned above them (e.g. the balance before the period), which no filter hides.
 *
 * @param {Array<object>} props.rows
 * @param {Array<{name: string, label?: string, inputType?: string, format?: string, link?: object}>} props.columns
 *   the columns in order, shaped like the report metadata's
 * @param {function(Array<object>): object} [props.totalRow]  the total row of the rows shown
 * @param {Array<object>} [props.pinnedTopRows]
 * @param {boolean} [props.autoHeight]  as tall as its rows (a short table in a scrolling tab), instead of filling the
 *   space it's given
 * @param {function} props.openLink  opens a linked cell as a dashboard window (useOpenLink)
 */
export default function FilterGrid({ rows, columns, totalRow, pinnedTopRows, autoHeight = false, openLink }) {
  // The same definitions while the columns stay, so a filter's new total row doesn't redo the columns' widths
  const columnDefs = useMemo(() => columns.map((column) => columnDef(column, openLink)), [columns, openLink]);
  // The rows the filters leave, in the grid's order, for the total row
  const [shownRows, setShownRows] = useState([]);
  const readShownRows = ({ api }) => {
    const shown = [];
    api.forEachNodeAfterFilter((node) => {
      if (node.data) {
        shown.push(node.data);
      }
    });
    setShownRows(shown);
  };
  const onRowDataUpdated = (event) => {
    readShownRows(event);
    autoSizeColumns(event);
  };
  const totalRows = totalRow && rows.length > 0 ? [totalRow(shownRows)] : [];

  return <Box sx={autoHeight ? { width: '100%' } : { width: '100%', height: '100%' }}>
    <AgGridProvider modules={modules}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={DEFAULT_COLUMN_DEF}
        autoSizeStrategy={AUTO_SIZE_STRATEGY}
        onRowDataUpdated={onRowDataUpdated}
        onFilterChanged={readShownRows}
        pinnedTopRowData={pinnedTopRows}
        pinnedBottomRowData={totalRows}
        getRowStyle={pinnedRowStyle}
        domLayout={autoHeight ? 'autoHeight' : 'normal'}
        localeText={LOCALE_TEXT}
        // Every column is drawn, also those scrolled out of view, so auto-sizing can measure them all
        suppressColumnVirtualisation
        enableRtl
        enableCellTextSelection
        ensureDomOrder
      />
    </AgGridProvider>
  </Box>;
}
