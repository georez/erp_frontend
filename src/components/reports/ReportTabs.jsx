'use client';

import dynamic from 'next/dynamic';
import 'react-querybuilder/dist/query-builder.css';
import './styles.css';
import {
  Alert, Box, Checkbox, CircularProgress, Divider, FormControlLabel, FormGroup, Stack, Typography,
} from '@mui/material';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import FormFields from '@/components/forms/FormFields';
import { arabicOperators } from '@/utils/reportutils';
import { DEFAULT_COLUMN_DEF } from './reportGrid';

const modules = [AllCommunityModule];

// react-querybuilder touches the DOM on load, so it is only rendered in the browser
const QueryBuilder = dynamic(() => import('react-querybuilder').then((module) => module.QueryBuilder), { ssr: false });

/** The tabs of the report screen, in order. */
export const TABS = {
  QUERY_1: 0, // the report's own params (search params 1)
  QUERY_2: 1, // the query builder: filters on the result's columns (search params 2)
  COLUMNS: 2,
  SORT: 3, // not implemented yet
  RESULT: 4,
};

/** Accessibility attributes linking a tab to its panel. */
export function tabProps(index) {
  return { id: `report-tab-${index}`, 'aria-controls': `report-tabpanel-${index}` };
}

const FILL = { flex: 1, minWidth: 0, minHeight: 0 };

/** One tab's content area; stays mounted while hidden, so each tab keeps its state. */
export function TabPanel({ children, value, index }) {
  const active = value === index;
  return <Box role="tabpanel" hidden={!active} id={`report-tabpanel-${index}`} aria-labelledby={`report-tab-${index}`}
    sx={{ ...FILL, display: active ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
    <Box sx={{ ...FILL, p: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </Box>
  </Box>;
}

/** A tab's scrollable content. */
function Scrollable({ children }) {
  return <Box sx={{ ...FILL, width: '100%', overflow: 'auto' }}>{children}</Box>;
}

function Loading() {
  return <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
}

/** A small spinner with a text beside it. */
function Progress({ text, marginBottom = 1 }) {
  return <Box sx={{ mb: marginBottom, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
    <CircularProgress size={18} />
    <Typography variant="body2" color="text.secondary">{text}</Typography>
  </Box>;
}

/** Query 1: the report's own params, with the same fields and checks as the CRUD forms. */
export function ParamsTab({ loading, paramFields, paramValues, setParamValues, paramValidity, setParamValidity,
  showParamErrors }) {
  let content;
  if (loading) {
    content = <Loading />;
  } else if (paramFields.length === 0) {
    content = <Typography color="text.secondary">لا توجد معايير لهذا التقرير.</Typography>;
  } else {
    content = <Stack spacing={2} sx={{ maxWidth: 480, pt: 1 }}>
      <FormFields formFields={paramFields} formValues={paramValues} setFormValues={setParamValues}
        isValid={paramValidity} setIsValid={setParamValidity} tryToSubmit={showParamErrors} />
    </Stack>;
  }
  return <Scrollable>{content}</Scrollable>;
}

/**
 * Query 2: the query builder; edits apply to the report on the next Run. Each field's validator (from
 * transformFields) marks rules with a missing or malformed value as .queryBuilder-invalid, which styles.css
 * highlights. No query-level validator is passed, so an empty query (all rows) is not marked invalid.
 */
export function QueryTab({ loading, fields, query, setQuery }) {
  return <Scrollable>
    {loading ? <Loading />
      : <QueryBuilder fields={fields} query={query} onQueryChange={setQuery} operators={arabicOperators} showNotToggle />}
  </Scrollable>;
}

/** Columns: which columns the result grid shows (applies at once, no re-run). */
export function ColumnsTab({ loading, reportColumns, visibleColumns, setVisibleColumns }) {
  const allSelected = reportColumns.length > 0 && reportColumns.every((column) => visibleColumns[column.field]);
  const someSelected = reportColumns.some((column) => visibleColumns[column.field]);

  const selectAll = (event) => {
    const checked = event.target.checked;
    setVisibleColumns(Object.fromEntries(reportColumns.map((column) => [column.field, checked])));
  };
  const toggle = (field) => (event) => {
    const checked = event.target.checked;
    setVisibleColumns((previous) => ({ ...previous, [field]: checked }));
  };

  return <Scrollable>
    <Typography variant="h6" sx={{ mb: 1 }}>اختيار الأعمدة</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      اختر الأعمدة التي ستظهر في نتيجة التقرير.
    </Typography>
    {loading && <Progress text="تحميل الأعمدة..." marginBottom={2} />}
    <Divider sx={{ mb: 1 }} />
    <FormControlLabel label="تحديد الكل" control={
      <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={selectAll} />
    } />
    <Divider sx={{ mb: 1 }} />
    <FormGroup>
      {reportColumns.map((column) => <FormControlLabel key={column.field} label={column.headerName} control={
        <Checkbox checked={Boolean(visibleColumns[column.field])} onChange={toggle(column.field)} />
      } />)}
    </FormGroup>
  </Scrollable>;
}

/** Sort: not implemented yet (see the sort state in Report). */
export function SortTab() {
  return <Scrollable>
    <Typography variant="h6" sx={{ mb: 1 }}>ترتيب حسب</Typography>
    <Typography variant="body2" color="text.secondary">أضف إعدادات الترتيب هنا.</Typography>
  </Scrollable>;
}

/** Result: the last run's error, its progress, and the result grid. */
export function ResultTab({ reportError, onCloseError, reportLoading, rows, columnDefs }) {
  return <Box sx={{ ...FILL, width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    overflow: 'hidden' }}>
    {reportError && <Alert severity="error" onClose={onCloseError} sx={{ mb: 1, flexShrink: 0 }}>
      {reportError}
    </Alert>}
    {reportLoading && <Progress text="جاري تنفيذ التقرير..." />}
    <Box sx={{ ...FILL, width: '100%', height: '100%', overflow: 'hidden' }}>
      <AgGridProvider modules={modules}>
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COLUMN_DEF}
          enableRtl
          // Users can select and copy cell text (the grid blocks selection by default); ensureDomOrder keeps the
          // cells in DOM order so a selection across cells copies in order
          enableCellTextSelection
          ensureDomOrder
        />
      </AgGridProvider>
    </Box>
  </Box>;
}
