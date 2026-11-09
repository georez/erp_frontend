'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'react-querybuilder/dist/query-builder.css';
import './styles.css';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, FormGroup, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import FormFields from '@/components/forms/FormFields';
import { arabicOperators, SORT_DIRECTIONS } from '@/utils/reportutils';
import {
  AUTO_SIZE_STRATEGY, autoSizeColumns, DEFAULT_COLUMN_DEF, pinnedTotalRows, totalRowStyle,
} from './reportGrid';

const modules = [AllCommunityModule];

// react-querybuilder touches the DOM on load, so it is only rendered in the browser
const QueryBuilder = dynamic(() => import('react-querybuilder').then((module) => module.QueryBuilder), { ssr: false });

/** The tabs of the report screen, in order. */
export const TABS = {
  QUERY_1: 0, // the report's own params (search params 1)
  QUERY_2: 1, // the query builder: filters on the result's columns (search params 2)
  COLUMNS: 2,
  SORT: 3, // the columns the rows are sorted by
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

/**
 * Columns: which columns the result grid shows, and which of them are frozen at its start, in view while the others
 * scroll sideways (both apply at once, no re-run).
 */
export function ColumnsTab({ loading, reportColumns, visibleColumns, setVisibleColumns, frozenColumns,
  setFrozenColumns }) {
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
  const toggleFrozen = (field) => () =>
    setFrozenColumns((previous) => ({ ...previous, [field]: !previous[field] }));

  return <Scrollable>
    <Typography variant="h6" sx={{ mb: 1 }}>اختيار الأعمدة</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      اختر الأعمدة التي ستظهر في نتيجة التقرير، وثبّت منها ما يبقى ظاهراً في بداية الجدول عند التمرير.
    </Typography>
    {loading && <Progress text="تحميل الأعمدة..." marginBottom={2} />}
    <Divider sx={{ mb: 1 }} />
    <FormControlLabel label="تحديد الكل" control={
      <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={selectAll} />
    } />
    <Divider sx={{ mb: 1 }} />
    <FormGroup>
      {reportColumns.map((column) => <FrozenToggleRow key={column.field} frozen={Boolean(frozenColumns[column.field])}
        onToggleFrozen={toggleFrozen(column.field)}>
        <FormControlLabel label={column.headerName} control={
          <Checkbox checked={Boolean(visibleColumns[column.field])} onChange={toggle(column.field)} />
        } />
      </FrozenToggleRow>)}
    </FormGroup>
  </Scrollable>;
}

/**
 * A column's row in the columns tab: a pin that freezes or unfreezes it, then its shown checkbox. The pin comes first,
 * so the pins line up whatever the labels' lengths.
 */
function FrozenToggleRow({ frozen, onToggleFrozen, children }) {
  return <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
    <Tooltip title={frozen ? 'إلغاء تثبيت العمود' : 'تثبيت العمود'}>
      <IconButton size="small" onClick={onToggleFrozen} aria-pressed={frozen} color={frozen ? 'primary' : 'default'}>
        {frozen ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
    {children}
  </Stack>;
}

/** The list with the entry at `from` moved to `to`. */
function moved(list, from, to) {
  const result = [...list];
  const [entry] = result.splice(from, 1);
  result.splice(to, 0, entry);
  return result;
}

/**
 * One sort column: which column, which direction, and buttons to move it up or down the order or remove it.
 *
 * @param {Array<{field: string, headerName: string}>} props.choices  the columns this entry may take: its own and
 *   those no other entry sorts by
 */
function SortRow({ index, entry, choices, isFirst, isLast, onChange, onMove, onRemove }) {
  return <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
    <Typography sx={{ minWidth: 24 }}>{index + 1}.</Typography>
    <TextField select size="small" label="العمود" value={entry.column} sx={{ minWidth: 200 }}
      onChange={(event) => onChange({ ...entry, column: event.target.value })}>
      {choices.map((column) => <MenuItem key={column.field} value={column.field}>{column.headerName}</MenuItem>)}
    </TextField>
    <TextField select size="small" label="الاتجاه" value={entry.direction} sx={{ minWidth: 120 }}
      onChange={(event) => onChange({ ...entry, direction: event.target.value })}>
      {SORT_DIRECTIONS.map((direction) => <MenuItem key={direction.value} value={direction.value}>
        {direction.label}
      </MenuItem>)}
    </TextField>
    <Tooltip title="أعلى">
      <span><IconButton size="small" disabled={isFirst} onClick={() => onMove(index - 1)}>
        <ArrowUpwardIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
    <Tooltip title="أسفل">
      <span><IconButton size="small" disabled={isLast} onClick={() => onMove(index + 1)}>
        <ArrowDownwardIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
    <Tooltip title="حذف">
      <IconButton size="small" onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
    </Tooltip>
  </Stack>;
}

/**
 * Sort: the columns the backend sorts the rows by, most important first, each ascending or descending; applies on the
 * next Run. A report with a fixed order comes in its own order, so it offers no columns.
 *
 * @param {Array<{field: string, headerName: string, sortable: boolean}>} props.reportColumns  the grid columns
 * @param {Array<{column: string, direction: string}>} props.sort
 */
export function SortTab({ loading, fixedOrder, reportColumns, sort, setSort }) {
  if (loading) {
    return <Scrollable><Loading /></Scrollable>;
  }
  if (fixedOrder) {
    return <Scrollable>
      <Typography variant="h6" sx={{ mb: 1 }}>ترتيب حسب</Typography>
      <Typography variant="body2" color="text.secondary">هذا التقرير يظهر بترتيب ثابت.</Typography>
    </Scrollable>;
  }

  const sortableColumns = reportColumns.filter((column) => column.sortable);
  const sortedFields = new Set(sort.map((entry) => entry.column));
  const unsortedColumns = sortableColumns.filter((column) => !sortedFields.has(column.field));

  const add = () => setSort([...sort, { column: unsortedColumns[0].field, direction: 'asc' }]);
  const change = (index, entry) => setSort(sort.map((current, i) => (i === index ? entry : current)));
  const move = (from, to) => setSort(moved(sort, from, to));
  const remove = (index) => setSort(sort.filter((current, i) => i !== index));
  const choicesFor = (entry) => sortableColumns.filter((column) =>
    column.field === entry.column || !sortedFields.has(column.field));

  return <Scrollable>
    <Typography variant="h6" sx={{ mb: 1 }}>ترتيب حسب</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      اختر الأعمدة التي ترتب بها النتيجة، الأهم أولا.
    </Typography>
    <Stack spacing={1.5} sx={{ pt: 1 }}>
      {sort.map((entry, index) => <SortRow key={entry.column} index={index} entry={entry}
        choices={choicesFor(entry)} isFirst={index === 0} isLast={index === sort.length - 1}
        onChange={(changed) => change(index, changed)} onMove={(to) => move(index, to)}
        onRemove={() => remove(index)} />)}
    </Stack>
    <Button size="small" startIcon={<AddIcon />} onClick={add} disabled={unsortedColumns.length === 0}
      sx={{ mt: 2 }}>
      إضافة عمود
    </Button>
  </Scrollable>;
}

/**
 * Result: the last run's error, its progress, and the result grid, with the report's total row (if it has totals)
 * pinned under the rows: the total of the rows on screen, i.e. of the rows left after the query builder's filters.
 *
 * @param {object|null} props.totals  the report metadata's totals
 */
export function ResultTab({ reportError, onCloseError, reportLoading, rows, columnDefs, totals }) {
  const totalRows = useMemo(() => pinnedTotalRows(rows, totals), [rows, totals]);

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
          autoSizeStrategy={AUTO_SIZE_STRATEGY}
          onRowDataUpdated={autoSizeColumns}
          onColumnVisible={autoSizeColumns}
          pinnedBottomRowData={totalRows}
          getRowStyle={totalRowStyle}
          // Every column is drawn, also those scrolled out of view, so auto-sizing can measure them all
          suppressColumnVirtualisation
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
