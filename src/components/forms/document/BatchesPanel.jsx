'use client';

import { Alert, Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import useSWR from 'swr';
import FloatingPanel from '@/components/dashboard/FloatingPanel';
import { fetchJson } from '@/utils/fetchJson';
import { formatExpiry } from '@/utils/expiryDates';
import { formatAmount } from './amounts';

/*
 * A floating panel of the batches a warehouse has of the entry row's product, with their quantities, earliest expiry
 * first: a click on one puts it into the entry row. Under them, in a strip that stays in view while they scroll, the
 * product's average cost as a discount (the weighted discount: what a count below a batch's balance is issued at) and
 * their total. Dragged by its title bar, the product's name.
 */

// Where the panel is first shown in its window: under the header and the entry row, over the grid's far end
const DEFAULT_BOX = { x: 16, y: 150, width: 320, height: 240 };

/** The batches' query: none without a product and a warehouse, or while the panel is hidden. */
function batchesUrl(productId, warehouseId, shown) {
  if (!shown || productId == null || warehouseId == null) {
    return null;
  }
  const params = new URLSearchParams({ productId, warehouseId });
  return `/api/stock-adjustments/batches?${params}`;
}

/**
 * A number, date or batch number, read left to right inside the right-to-left panel. Styled inline: the theme's RTL
 * plugin flips sx (NUMBER_CELL's ltr and right would become rtl and left, off the column's header).
 */
function Ltr({ children }) {
  return <bdi style={{ direction: 'ltr' }}>{children}</bdi>;
}

function PanelMessage({ children }) {
  return <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>{children}</Typography>;
}

/** One of the strip's figures: its label, then its value in bold. */
function Figure({ label, value }) {
  return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 700 }}><Ltr>{value}</Ltr></Typography>
  </Stack>;
}

/** The average cost's discount (the weighted discount) and the batches' total, kept in view under the list however far it's scrolled. */
function SummaryStrip({ inStock }) {
  const discount = inStock.averageCostDiscountPercent;
  return <Stack direction="row" useFlexGap spacing={2} sx={{
    alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', px: 1.5, py: 0.75, flexShrink: 0,
    borderTop: 1, borderColor: 'divider',
  }}>
    <Figure label="الخصم المرجح" value={discount == null ? '—' : `${formatAmount(discount)} %`} />
    <Figure label="اجمالي الكمية" value={formatAmount(inStock.totalQuantity)} />
  </Stack>;
}

/** The batches, a click choosing one. */
function BatchesTable({ batches, isChosen, onChoose }) {
  return <Table size="small" stickyHeader>
    <TableHead>
      <TableRow>
        <TableCell>التشغيلة</TableCell>
        <TableCell>الصلاحية</TableCell>
        <TableCell>الكمية</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {batches.map((batch) => <TableRow key={`${batch.batchNumber} ${batch.expiryDate}`} hover
        selected={isChosen(batch)} sx={{ cursor: 'pointer' }} onClick={() => onChoose(batch)}>
        <TableCell><Ltr>{batch.batchNumber}</Ltr></TableCell>
        <TableCell><Ltr>{formatExpiry(batch.expiryDate)}</Ltr></TableCell>
        <TableCell><Ltr>{formatAmount(batch.quantity)}</Ltr></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
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
  const { data: inStock, error, isLoading } = useSWR(batchesUrl(productId, warehouseId, visible), fetchJson);

  const isChosen = (batch) => batch.batchNumber === chosen.batchNumber
    && formatExpiry(batch.expiryDate) === chosen.expiryDate;

  const content = () => {
    if (warehouseId == null) {
      return <PanelMessage>اختر المخزن أولاً</PanelMessage>;
    }
    if (error) {
      return <Alert severity="error" sx={{ m: 1 }}>{error.message}</Alert>;
    }
    if (isLoading || !inStock) {
      return <PanelMessage>جارٍ التحميل…</PanelMessage>;
    }
    if (inStock.batches.length === 0) {
      return <PanelMessage>لا توجد تشغيلات لهذا الصنف في المخزن</PanelMessage>;
    }
    return <Stack sx={{ height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <BatchesTable batches={inStock.batches} isChosen={isChosen} onChoose={onChoose} />
      </Box>
      <SummaryStrip inStock={inStock} />
    </Stack>;
  };

  return <FloatingPanel title={productName ?? ''} defaultBox={DEFAULT_BOX} visible={visible} onClose={onHide}>
    {visible && content()}
  </FloatingPanel>;
}
