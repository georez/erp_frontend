'use client';

import { Alert, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import useSWR from 'swr';
import FloatingPanel from '@/components/dashboard/FloatingPanel';
import { fetchJson } from '@/utils/fetchJson';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount, NUMBER_CELL } from './amounts';

/*
 * A floating panel of the batches a warehouse has of the entry row's product, with their quantities, earliest expiry
 * first: a click on one puts it into the entry row. Dragged by its title bar, the product's name.
 */

// Where the panel is first shown in its window: under the header and the entry row, over the grid's far end
const DEFAULT_BOX = { x: 16, y: 150, width: 320, height: 240 };

const NO_BATCHES = [];

/** The batches' query: none without a product and a warehouse, or while the panel is hidden. */
function batchesUrl(productId, warehouseId, shown) {
  if (!shown || productId == null || warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({ productId, warehouseId });
  return `/api/stock-adjustments/batches?${params}`;
}

function PanelMessage({ children }) {
  return <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>{children}</Typography>;
}

/**
 * @param productId, productName the entry row's product; the panel is shown only while there is one
 * @param shown       whether the user has the panel on (the form's toggle)
 * @param chosen      the entry row's batch ({ batchNumber, expiryDate as typed }), highlighted in the list
 * @param onChoose    a batch clicked ({ batchNumber, expiryDate, quantity })
 * @param onHide      the panel's close button: turns the toggle off
 */
export function BatchesPanel({ productId, productName, warehouseId, shown, chosen, onChoose, onHide }) {
  const visible = shown && productId != null;
  const { data: batches = NO_BATCHES, error, isLoading } = useSWR(
    batchesUrl(productId, warehouseId, visible), fetchJson);

  const isChosen = (batch) => batch.batchNumber === chosen.batchNumber
    && formatExpiry(batch.expiryDate) === chosen.expiryDate;

  const content = () => {
    if (warehouseId == null) {
      return <PanelMessage>اختر المخزن أولاً</PanelMessage>;
    }
    if (error) {
      return <Alert severity="error" sx={{ m: 1 }}>{error.message}</Alert>;
    }
    if (isLoading) {
      return <PanelMessage>جارٍ التحميل…</PanelMessage>;
    }
    if (batches.length === 0) {
      return <PanelMessage>لا توجد تشغيلات لهذا الصنف في المخزن</PanelMessage>;
    }
    return <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell>التشغيلة</TableCell>
          <TableCell>الصلاحية</TableCell>
          <TableCell>الرصيد</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {batches.map((batch) => <TableRow key={`${batch.batchNumber} ${batch.expiryDate}`} hover
          selected={isChosen(batch)} sx={{ cursor: 'pointer' }} onClick={() => onChoose(batch)}>
          <TableCell sx={NUMBER_CELL}>{batch.batchNumber}</TableCell>
          <TableCell sx={NUMBER_CELL}>{formatExpiry(batch.expiryDate)}</TableCell>
          <TableCell sx={NUMBER_CELL}>{formatAmount(batch.quantity)}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table>;
  };

  return <FloatingPanel title={productName ?? ''} defaultBox={DEFAULT_BOX} visible={visible} onClose={onHide}>
    {visible && content()}
  </FloatingPanel>;
}
