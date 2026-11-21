'use client';

import { useMemo, useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import {
  BY_SERIAL, detailOf, isOpeningRow, MOVEMENT_TABS, movementSerialRows, movementSummary, splitStockRows, tabColumns,
  tabRows, tabSerialRows,
} from '@/utils/productMovements';
import ReportPageFrame from '../ReportPageFrame';
import { useReportPage, useReportRun } from '../useReportPage';
import FilterGrid from './FilterGrid';
import MovementSummary from './MovementSummary';

const SUMMARY_TAB = 'summary';

/** The serials table of a tab (by batch and serials, with batch rows): each serial moved, one per row. */
const SERIAL_MOVEMENT_COLUMNS = [
  { name: 'entry_datetime', label: 'التاريخ', inputType: 'datetime-local' },
  { name: 'document_id', label: 'المستند', link: { documentColumn: 'document_page', idColumn: 'document_id' } },
  { name: 'operation', label: 'العملية' },
  { name: 'warehouse_name', label: 'المخزن' },
  { name: 'batch_number', label: 'رقم التشغيلة' },
  { name: 'expiry_date', label: 'تاريخ الصلاحية', inputType: 'date' },
  { name: 'serial_number', label: 'السيريال' },
];

/** The start of the current month, in the browser's time zone, as a datetime param takes it: the period's start. */
function startOfMonth() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${today.getFullYear()}-${month}-01T00:00:00`;
}

/**
 * The tab's columns, with the report's labels, types and links where the tab doesn't name them itself. In one
 * warehouse, the balance in its own warehouse is the balance: shown once.
 */
function gridColumns(tab, detail, oneWarehouse, metadataColumns) {
  const byName = new Map(metadataColumns.map((column) => [column.name, column]));
  const columns = tabColumns(tab, detail.byBatch, detail.splitBySerial)
    .filter(({ field }) => !(oneWarehouse && field === 'warehouse_balance_after'));
  return columns.map(({ field, header }) => {
    const column = byName.get(field) ?? { name: field };
    return header ? { ...column, label: header } : column;
  });
}

/**
 * A product's movements (حركة صنف): choose a product, a period and optionally a warehouse (the movements and balances
 * are then that warehouse's), then
 * - the summary: its public price, its balance before the period, what each operation brought in and took out, its
 *   balance at the end, and its stock in every warehouse now, with what's reserved and free;
 * - every movement in order, each with the balance after it, in all warehouses and in its own;
 * - a tab per kind of document, with its details (a sale's customer, discount, cost and profit...).
 * By batch, each document's batches are rows of their own. By batch and serials (the only detail that offers the
 * serials' view), either each serialized piece is a row of its own (the rest of its batch another), or the batch rows
 * stay and a table under them lists each serial the tab's documents moved, or a row's own once it's clicked; and the
 * summary lists the serials in stock now. Every tab sorts and filters by any column;
 * its total row adds up the rows the filters leave.
 *
 * The rows come from productMovementsReport, productStockReport and productSerialMovementsReport; the page's state is
 * in its URL (useReportPage).
 * All props come from the dashboard URL's search parameters, so they are strings.
 */
export default function ProductMovements({ formId, formTitle = 'حركة صنف', execute, requestTime, params }) {
  const openLink = useOpenLink();
  const [tabKey, setTabKey] = useState(SUMMARY_TAB);
  // The movement row clicked for its serials, and its tab's key
  const [selected, setSelected] = useState(null);

  const report = useReportPage({
    reportName: 'productMovementsReport',
    page: 'product-movements',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: {
      p_product_id: null, p_warehouse_id: null, p_from: startOfMonth(), p_to: null, p_detail: null,
      p_serials_view: null,
    },
  });
  // What the rows are of: the params they were run with (the URL's), not the ones being edited
  const runParams = parseJsonObject(params, {});
  const productId = runParams.p_product_id ?? null;
  const warehouseId = runParams.p_warehouse_id ?? null;
  const detail = detailOf(runParams);
  // The stock now: of the product only, in every warehouse, whatever the period and the warehouse chosen
  const stockRun = useReportRun({
    reportName: 'productStockReport', reportParams: { p_product_id: productId }, execute, requestTime,
    ready: productId !== null,
  });
  // By batch and serials with batch rows: the serials moved, for the tabs' serials tables
  const serialsRun = useReportRun({
    reportName: 'productSerialMovementsReport',
    reportParams: { p_product_id: productId, p_warehouse_id: warehouseId, p_from: runParams.p_from ?? null,
      p_to: runParams.p_to ?? null },
    execute, requestTime, ready: productId !== null && detail.serialsTable,
  });

  const { metadata, rows } = report;
  const summary = useMemo(() => movementSummary(rows), [rows]);
  const stock = useMemo(() => splitStockRows(stockRun.rows), [stockRun.rows]);
  const openingRows = useMemo(() => rows.filter(isOpeningRow), [rows]);
  const { byBatch, withSerials, splitBySerial, serialsTable } = detail;
  const tabs = useMemo(() => MOVEMENT_TABS.map((tab) => ({
    ...tab,
    rows: tabRows(rows, tab),
    serialRows: tabSerialRows(serialsRun.rows, tab),
    columns: gridColumns(tab, { byBatch, splitBySerial }, warehouseId !== null, metadata?.columns ?? []),
  })), [rows, serialsRun.rows, byBatch, splitBySerial, warehouseId, metadata]);
  const shownTab = tabs.find((tab) => tab.key === tabKey);
  // The row clicked, while it's one of the tab's rows (a new run's rows are other rows)
  const selectedRow = selected && shownTab && selected.tabKey === shownTab.key && shownTab.rows.includes(selected.row)
    ? selected.row : null;
  const shownSerialRows = useMemo(() => (shownTab && selectedRow
    ? movementSerialRows(shownTab.serialRows, selectedRow) : shownTab?.serialRows), [shownTab, selectedRow]);
  // The serials' view is a choice of the by batch and serials detail only
  const { paramForm } = report;
  const paramFields = useMemo(() => paramForm.paramFields.filter((field) => field.fieldName !== 'p_serials_view'
    || paramForm.paramValues.p_detail === BY_SERIAL), [paramForm.paramFields, paramForm.paramValues.p_detail]);

  // The reports run together: the page shows any one's error, and waits for them all
  const frame = {
    ...report,
    paramForm: { ...paramForm, paramFields },
    loading: report.loading || stockRun.loading || serialsRun.loading,
    runError: report.runError || stockRun.runError || serialsRun.runError,
    clearRunError: () => {
      report.clearRunError();
      stockRun.clearRunError();
      serialsRun.clearRunError();
    },
  };
  const movementsGrid = shownTab && <FilterGrid key={shownTab.key} rows={shownTab.rows} columns={shownTab.columns}
    openLink={openLink} pinnedTopRows={shownTab.key === 'all' ? openingRows : undefined}
    onRowSelected={serialsTable ? (row) => setSelected(row && { tabKey: shownTab.key, row }) : undefined}
    totalRow={(shown) => totalsRow(shown, {
      label: 'الإجمالي', labelColumn: 'entry_datetime', columns: shownTab.totals, countRows: true,
    })} />;

  return <ReportPageFrame report={frame} emptyText="لا يوجد صنف بهذا الرقم.">
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tabKey} onChange={(event, key) => setTabKey(key)} variant="scrollable" scrollButtons="auto"
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value={SUMMARY_TAB} label="الملخص والأرصدة" />
        {tabs.map((tab) => <Tab key={tab.key} value={tab.key} label={`${tab.label} (${tab.rows.length})`} />)}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {shownTab && !serialsTable && movementsGrid}
        {shownTab && serialsTable && <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>{movementsGrid}</Box>
          <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
            {selectedRow ? 'سيريالات السطر المختار (اضغط عليه مرة أخرى لعرض الكل)'
              : 'السيريالات (اضغط على سطر لعرض سيريالاته فقط)'}
          </Typography>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <FilterGrid key={`${shownTab.key}-serials`} rows={shownSerialRows} columns={SERIAL_MOVEMENT_COLUMNS}
              openLink={openLink}
              totalRow={(shown) => ({ entry_datetime: `الإجمالي (عدد الصفوف: ${shown.length})` })} />
          </Box>
        </Box>}
        {!shownTab && <MovementSummary summary={summary} stock={stock} byBatch={byBatch} withSerials={withSerials}
          warehouseId={warehouseId} openLink={openLink} />}
      </Box>
    </Box>
  </ReportPageFrame>;
}
