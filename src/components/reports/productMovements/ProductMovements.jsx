'use client';

import { useMemo, useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useOpenLink } from '@/utils/useOpenLink';
import { parseJsonObject, totalsRow } from '@/utils/reportutils';
import {
  isOpeningRow, MOVEMENT_TABS, movementSummary, splitStockRows, tabColumns, tabRows,
} from '@/utils/productMovements';
import ReportPageFrame from '../ReportPageFrame';
import { useReportPage, useReportRun } from '../useReportPage';
import FilterGrid from './FilterGrid';
import MovementSummary from './MovementSummary';

const SUMMARY_TAB = 'summary';

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
function gridColumns(tab, byBatch, oneWarehouse, metadataColumns) {
  const byName = new Map(metadataColumns.map((column) => [column.name, column]));
  const columns = tabColumns(tab, byBatch)
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
 * By batch, each document's batches are rows of their own. Every tab sorts and filters by any column; its total row
 * adds up the rows the filters leave.
 *
 * The rows come from productMovementsReport and productStockReport; the page's state is in its URL (useReportPage).
 * All props come from the dashboard URL's search parameters, so they are strings.
 */
export default function ProductMovements({ formId, formTitle = 'حركة صنف', execute, requestTime, params }) {
  const openLink = useOpenLink();
  const [tabKey, setTabKey] = useState(SUMMARY_TAB);

  const report = useReportPage({
    reportName: 'productMovementsReport',
    page: 'product-movements',
    formId,
    formTitle,
    params,
    execute,
    requestTime,
    initialParams: { p_product_id: null, p_warehouse_id: null, p_from: startOfMonth(), p_to: null, p_by_batch: false },
  });
  // What the rows are of: the params they were run with (the URL's), not the ones being edited
  const runParams = parseJsonObject(params, {});
  const productId = runParams.p_product_id ?? null;
  const warehouseId = runParams.p_warehouse_id ?? null;
  const byBatch = runParams.p_by_batch === true || runParams.p_by_batch === 'true';
  // The stock now: of the product only, in every warehouse, whatever the period and the warehouse chosen
  const stockRun = useReportRun({
    reportName: 'productStockReport', reportParams: { p_product_id: productId }, execute, requestTime,
    ready: productId !== null,
  });

  const { metadata, rows } = report;
  const summary = useMemo(() => movementSummary(rows), [rows]);
  const stock = useMemo(() => splitStockRows(stockRun.rows), [stockRun.rows]);
  const openingRows = useMemo(() => rows.filter(isOpeningRow), [rows]);
  const tabs = useMemo(() => MOVEMENT_TABS.map((tab) => ({
    ...tab,
    rows: tabRows(rows, tab),
    columns: gridColumns(tab, byBatch, warehouseId !== null, metadata?.columns ?? []),
  })), [rows, byBatch, warehouseId, metadata]);
  const shownTab = tabs.find((tab) => tab.key === tabKey);

  // Both reports run together: the page shows either's error, and waits for both
  const frame = {
    ...report,
    loading: report.loading || stockRun.loading,
    runError: report.runError || stockRun.runError,
    clearRunError: () => {
      report.clearRunError();
      stockRun.clearRunError();
    },
  };

  return <ReportPageFrame report={frame} emptyText="لا يوجد صنف بهذا الرقم.">
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tabKey} onChange={(event, key) => setTabKey(key)} variant="scrollable" scrollButtons="auto"
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value={SUMMARY_TAB} label="الملخص والأرصدة" />
        {tabs.map((tab) => <Tab key={tab.key} value={tab.key} label={`${tab.label} (${tab.rows.length})`} />)}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {shownTab
          ? <FilterGrid key={shownTab.key} rows={shownTab.rows} columns={shownTab.columns} openLink={openLink}
            pinnedTopRows={shownTab.key === 'all' ? openingRows : undefined}
            totalRow={(shown) => totalsRow(shown, {
              label: 'الإجمالي', labelColumn: 'entry_datetime', columns: shownTab.totals, countRows: true,
            })} />
          : <MovementSummary summary={summary} stock={stock} byBatch={byBatch} warehouseId={warehouseId}
            openLink={openLink} />}
      </Box>
    </Box>
  </ReportPageFrame>;
}
