'use client';

import { Box, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, Typography } from '@mui/material';
import { formatAmount, formatDecimal } from '@/utils/decimals';
import { Big } from 'bigdecimal.js';
import { stockTotalRow } from '@/utils/productMovements';
import { Amount, AMOUNT_CELL } from '../virtualTable';
import FilterGrid from './FilterGrid';

/** The stock now, per warehouse (productStockReport's columns, as its metadata would describe them). */
const WAREHOUSE_COLUMNS = [
  { name: 'warehouse_name', label: 'المخزن' },
  { name: 'quantity', label: 'الكمية', inputType: 'number' },
  { name: 'reserved_quantity', label: 'محجوز', inputType: 'number' },
  { name: 'free_quantity', label: 'متاح للبيع', inputType: 'number' },
  { name: 'average_discount_percent', label: 'متوسط الخصم %', inputType: 'number' },
  { name: 'average_cost', label: 'متوسط تكلفة الوحدة', inputType: 'number' },
  { name: 'value', label: 'القيمة بالتكلفة', inputType: 'number', format: 'amount' },
  { name: 'public_value', label: 'القيمة بسعر الجمهور', inputType: 'number', format: 'amount' },
];

/** The stock now, per batch in each warehouse: reserved is what the drafts named of the batch. */
const BATCH_COLUMNS = [
  { name: 'warehouse_name', label: 'المخزن' },
  { name: 'batch_number', label: 'رقم التشغيلة' },
  { name: 'expiry_date', label: 'تاريخ الصلاحية', inputType: 'date' },
  { name: 'quantity', label: 'الكمية', inputType: 'number' },
  { name: 'reserved_quantity', label: 'محجوز منها بالاسم', inputType: 'number' },
  { name: 'free_quantity', label: 'متاح منها', inputType: 'number' },
  { name: 'value', label: 'القيمة بالتكلفة', inputType: 'number', format: 'amount' },
  { name: 'public_value', label: 'القيمة بسعر الجمهور', inputType: 'number', format: 'amount' },
];

const quantityText = (quantity) => formatDecimal(Big(quantity));
const percentText = (percent) => (percent === null ? '' : formatDecimal(Big(percent)));

/** A figure of the summary: its label over a quantity and its value at cost. */
function Figure({ label, quantity, value }) {
  return <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.5, minWidth: 130 }}>
    <Typography variant="body2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 'bold', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
      <Amount>{quantity}</Amount>
    </Typography>
    {value !== undefined && <Typography variant="caption" color="text.secondary" component="div"
      sx={{ textAlign: 'center' }}>
      <Amount>{value}</Amount>
    </Typography>}
  </Box>;
}

/** The operations of one direction (what came in, or what went out), each with its figures, and their total. */
function OperationsTable({ title, operations, total }) {
  return <Box sx={{ flex: 1, minWidth: 420 }}>
    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{title}</Typography>
    <Table size="small" sx={{ border: 1, borderColor: 'divider' }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 'bold' }}>العملية</TableCell>
          <TableCell sx={{ fontWeight: 'bold' }}>المستندات</TableCell>
          <TableCell sx={{ fontWeight: 'bold' }}>الكمية</TableCell>
          <TableCell sx={{ fontWeight: 'bold' }}>القيمة بالتكلفة</TableCell>
          <TableCell sx={{ fontWeight: 'bold' }}>الخصم %</TableCell>
          <TableCell sx={{ fontWeight: 'bold' }}>خصم التكلفة %</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {operations.map((operation) => <TableRow key={operation.name}
          sx={operation.documents === 0 ? { '& td': { color: 'text.disabled' } } : undefined}>
          <TableCell>{operation.name}</TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{operation.documents}</Amount></TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{quantityText(operation.quantity)}</Amount></TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{formatAmount(operation.value)}</Amount></TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{percentText(operation.discountPercent)}</Amount></TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{percentText(operation.costDiscountPercent)}</Amount></TableCell>
        </TableRow>)}
      </TableBody>
      <TableFooter>
        <TableRow sx={{ '& td': { fontWeight: 'bold', color: 'text.primary', fontSize: 'inherit' } }}>
          <TableCell>الإجمالي</TableCell>
          <TableCell />
          <TableCell sx={AMOUNT_CELL}><Amount>{quantityText(total.quantity)}</Amount></TableCell>
          <TableCell sx={AMOUNT_CELL}><Amount>{formatAmount(total.value)}</Amount></TableCell>
          <TableCell />
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  </Box>;
}

/**
 * The summary tab: the product's public price, its balance before the period, what each operation brought in and took
 * out in the period, and its balance at the end; then its stock in the warehouses now (whatever the period), with
 * what's reserved and free, and by batch, its batches.
 *
 * @param {object} props.summary  movementSummary of the report's rows
 * @param {{warehouses: Array<object>, batches: Array<object>}} props.stock  the stock now (splitStockRows)
 * @param {boolean} props.byBatch
 * @param {string|number|null} props.warehouseId  the warehouse the movements are of; null for all of them (the stock
 *   now is always every warehouse's)
 */
export default function MovementSummary({ summary, stock, byBatch, warehouseId, openLink }) {
  const { publicPrice, opening, operations, totalIn, totalOut, closing } = summary;
  const figure = ({ quantity, value }) => ({ quantity: quantityText(quantity), value: formatAmount(value) });
  const chosenWarehouse = warehouseId === null ? null
    : stock.warehouses.find((row) => String(row.warehouse_id) === String(warehouseId));

  return <Box sx={{ width: '100%', height: '100%', overflow: 'auto', p: 1, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 2 }}>
    {warehouseId !== null && <Typography variant="body2" color="text.secondary">
      {`الحركة والأرصدة أدناه في ${chosenWarehouse ? `المخزن "${chosenWarehouse.warehouse_name}"` : 'المخزن المختار'}`
        + ' فقط؛ الرصيد الآن لكل المخازن.'}
    </Typography>}
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Figure label="سعر الجمهور" quantity={formatAmount(publicPrice)} />
      <Figure label="رصيد أول المدة" {...figure(opening)} />
      <Figure label="إجمالي الوارد" {...figure(totalIn)} />
      <Figure label="إجمالي المنصرف" {...figure(totalOut)} />
      <Figure label="رصيد آخر المدة" {...figure(closing)} />
    </Stack>

    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <OperationsTable title="الوارد" operations={operations.filter(({ direction }) => direction === 'in')}
        total={totalIn} />
      <OperationsTable title="المنصرف" operations={operations.filter(({ direction }) => direction === 'out')}
        total={totalOut} />
    </Stack>

    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>الرصيد في المخازن الآن</Typography>
      {stock.warehouses.length === 0
        ? <Typography color="text.secondary">لا يوجد رصيد من الصنف في أي مخزن.</Typography>
        : <FilterGrid rows={stock.warehouses} columns={WAREHOUSE_COLUMNS} autoHeight openLink={openLink}
          totalRow={(shown) => stockTotalRow(shown, publicPrice, 'warehouse_name')} />}
    </Box>

    {byBatch && stock.batches.length > 0 && <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>التشغيلات الآن</Typography>
      <FilterGrid rows={stock.batches} columns={BATCH_COLUMNS} autoHeight openLink={openLink}
        totalRow={(shown) => stockTotalRow(shown, publicPrice, 'warehouse_name')} />
    </Box>}
  </Box>;
}
