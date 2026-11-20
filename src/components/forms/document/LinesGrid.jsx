'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import { Box, IconButton } from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount, NUMBER_CELL } from './amounts';

const modules = [AllCommunityModule];

/** A text column (the product's name, a batch number). */
export const textColumn = (field, headerName, { flex = 1, minWidth = 110 } = {}) => ({
  field, headerName, flex, minWidth,
});

/** A column of amounts (decimal text), formatted. */
export const amountColumn = (field, headerName, minWidth = 90) => ({
  field, headerName, flex: 1, minWidth, valueFormatter: ({ value }) => formatAmount(value), cellStyle: NUMBER_CELL,
});

/** The expiry date column (dd/mm/yyyy). */
export const expiryColumn = (field = 'expiryDate') => ({
  field, headerName: 'الصلاحية', flex: 1, minWidth: 105, cellStyle: NUMBER_CELL,
  valueFormatter: ({ value }) => formatExpiry(value),
});

/**
 * The column of each row's delete button (none on a pinned total row); no column when the rows can't change (a posted
 * document's). A delete is queued like a line's OK, so the button stays on.
 *
 * @param nameOf what the button deletes, for its label: the row's product by default
 */
export const deleteColumn = (readOnly, onDelete, nameOf = (row) => row.productName) => {
  if (readOnly) {
    return [];
  }
  return [{
    headerName: '', colId: 'delete', width: 56, resizable: false,
    cellRenderer: ({ data, node }) => {
      if (node.rowPinned) {
        return null;
      }
      return <IconButton size="small" aria-label={`حذف ${nameOf(data)}`} onClick={() => onDelete(data)}>
        <DeleteIcon fontSize="small" />
      </IconButton>;
    },
  }];
};

/**
 * A grid of the document's rows; a click on a row (not on its buttons or links) edits it, unless they're read only (a
 * posted document's).
 */
export function LinesGrid({
  rows, columnDefs, pinnedBottomRowData, readOnly, onEdit, emptyText, minHeight = 160, flex = 1,
}) {
  const handleRowClicked = ({ data, node, event }) => {
    const clickedAControl = event?.target?.closest?.('button, a');
    if (!readOnly && !node.rowPinned && !clickedAControl) {
      onEdit(data);
    }
  };
  return <Box sx={{ flex, minHeight }}>
    <AgGridProvider modules={modules}>
      {/* The no-rows template is read once, when the grid is created: a new text (e.g. once the document is posted)
          needs a new grid */}
      <AgGridReact
        key={emptyText}
        rowData={rows}
        columnDefs={columnDefs}
        pinnedBottomRowData={pinnedBottomRowData}
        getRowId={({ data }) => String(data.id)}
        onRowClicked={handleRowClicked}
        // A cell is redrawn only when its own value changes: one coloured by another field (a unit price under its
        // cost) is redrawn with the rest of its row
        onRowDataUpdated={({ api }) => api.refreshCells({ force: true })}
        rowStyle={readOnly ? undefined : { cursor: 'pointer' }}
        defaultColDef={{ sortable: false, resizable: true, wrapHeaderText: true, autoHeaderHeight: true }}
        enableRtl
        enableCellTextSelection
        ensureDomOrder
        overlayNoRowsTemplate={`<span>${emptyText}</span>`}
      />
    </AgGridProvider>
  </Box>;
}
