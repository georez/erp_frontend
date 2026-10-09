'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import 'react-querybuilder/dist/query-builder.css';
import './styles.css';

import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormGroup,
  Stack,
  Tab,
  Tabs,
  Typography,
  Alert,
} from '@mui/material';

import {
  AgGridProvider,
  AgGridReact,
} from 'ag-grid-react';

import {
  AllCommunityModule,
} from 'ag-grid-community';

import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';

import {
  transformFields,
  arabicOperators,
  validateReportQuery,
} from '@/utils/reportutils';
import { CSRF_HEADER_NAME } from '@/constants';
import { getNewCsrfToken } from '@/utils/csrfClientUtils';

const modules = [AllCommunityModule];

// react-querybuilder touches the DOM on load, so it is only rendered in the browser
const QueryBuilder = dynamic(
  () =>
    import('react-querybuilder').then(
      (mod) => mod.QueryBuilder
    ),
  {
    ssr: false,
  }
);

/** Query used when the URL has none (or an unreadable one): no conditions, i.e. all rows. */
const initialQuery = {
  combinator: 'and',
  rules: [],
};

/** Tab order in the report screen. */
const TABS = {
  QUERY_1: 0, // not implemented yet
  QUERY_2: 1, // the query builder
  COLUMNS: 2,
  SORT: 3,    // not implemented yet
  RESULT: 4,
};

/**
 * Loads the report's column list from the backend. One list serves both the query builder (every column
 * can be filtered on, see transformFields) and the result grid (every column can be shown, see
 * toGridColumns).
 *
 * @param {string} reportName
 * @returns {Promise<Array<{name: string, label: string, inputType?: string, valueEditorType?: string}>>}
 *   one entry per report column; inputType is e.g. 'number', 'date', 'datetime-local'
 */
async function fetchReportColumnsApi(
  reportName
) {
  const response = await fetch(
    `/api/report/${encodeURIComponent(reportName)}/searchparams2`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load report columns (${response.status})`
    );
  }

  return response.json();
}

/**
 * Turns the backend's column list into the result grid's columns. Width, filtering, sorting and resizing
 * are left to the grid defaults (see columnDefs and defaultColDef).
 *
 * @param {Array<{name: string, label?: string, inputType?: string}>} backendColumns
 * @returns {Array<{field: string, headerName: string, visibleByDefault: boolean, type: string|null}>}
 *   `type` is 'numericColumn' for numbers (right-aligned in AG Grid), otherwise null
 */
function toGridColumns(backendColumns) {
  return backendColumns.map((column) => ({
    field: column.name,
    headerName: column.label ?? column.name,
    visibleByDefault: true,
    type: column.inputType === 'number' ? 'numericColumn' : null,
  }));
}

/**
 * Runs the report through the Next.js route /custom/api/report/{reportName}/execute. That route checks the
 * query against the report's fields, turns it into parameterized SQL, signs the request and forwards it to
 * the backend, which runs it as a read-only database role.
 *
 * `columns` and `sort` are sent for future use; the route and backend currently ignore them and return every
 * column, unsorted.
 *
 * @param {object} args
 * @param {string} args.csrfToken  required for the POST (checked by the proxy)
 * @param {string} args.reportName
 * @param {object} args.query  react-querybuilder query
 * @param {string[]} args.columns  fields of the currently visible columns
 * @param {Array<{field: string, direction: 'asc'|'desc'}>} args.sort
 * @returns {Promise<Array<object>>} result rows, one object per row keyed by column field
 * @throws {Error} with the route's error message when the request fails
 */
async function executeReportApi({
  csrfToken,
  reportName,
  query,
  columns,
  sort,
}) {
  const response = await fetch(
    `/custom/api/report/${encodeURIComponent(reportName)}/execute`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [CSRF_HEADER_NAME]: csrfToken
      },
      body: JSON.stringify({
        query,
        columns,
        sort,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = `Report execution failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Not JSON: keep the status-based message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  // The route returns the rows as an array; { rows } and { data } wrappers are accepted as well
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  throw new Error(
    'Invalid execute API response'
  );
}

/** One tab's content area; stays mounted while hidden so each tab keeps its state. */
function CustomTabPanel({
  children,
  value,
  index,
  ...other
}) {
  const active = value === index;

  return (
    <Box
      role="tabpanel"
      hidden={!active}
      id={`report-tabpanel-${index}`}
      aria-labelledby={`report-tab-${index}`}
      {...other}
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * Visibility for a freshly loaded column list: keeps the user's current choice for columns that still
 * exist, and uses each new column's default otherwise.
 *
 * @param {Object<string, boolean>} previous  current visibility, keyed by column field
 * @param {Array<{field: string, visibleByDefault?: boolean}>} columns
 * @returns {Object<string, boolean>}
 */
function mergeColumnVisibility(previous, columns) {
  const next = {};
  columns.forEach((column) => {
    if (Object.prototype.hasOwnProperty.call(previous, column.field)) {
      next[column.field] = previous[column.field];
    } else {
      next[column.field] = column.visibleByDefault !== false;
    }
  });
  return next;
}

/** Accessibility attributes linking a tab to its panel. */
function a11yProps(index) {
  return {
    id: `report-tab-${index}`,
    'aria-controls': `report-tabpanel-${index}`,
  };
}

/**
 * Report screen: build a filter with the query builder, choose which columns to show, run the report and
 * see the result in a grid.
 *
 * The report's state lives in its dashboard URL (updated through useUpdateOpenForms), so a report link can be
 * reopened or shared and runs itself again:
 * - `query`: the query-builder query, JSON-encoded
 * - `execute`: "true" once the report has been run
 * - `requestTime`: set on every Run, so running the same query again still triggers a new run
 *
 * Flow:
 * 1. On load, the report's columns are fetched from the backend once; both the query-builder fields and the
 *    grid columns are derived from them.
 * 2. Run writes the query into the URL; the execute effect sees the new URL values and runs the report.
 * 3. The rows are shown in AG Grid. Showing or hiding columns happens in the grid only and doesn't re-run.
 *
 * All props come from the dashboard URL's search parameters, so they are strings.
 *
 * @param {object} props
 * @param {string} props.formId  id of this open form in the dashboard, used to update its URL
 * @param {string} props.formTitle
 * @param {string} props.reportName  backend report name, e.g. "customerCategoriesReport"
 * @param {string} [props.execute]  "true" to run the report
 * @param {string} [props.requestTime]  time of the last Run
 * @param {string} [props.query]  JSON-encoded react-querybuilder query
 */
export default function Report({
  formId,
  formTitle,
  reportName,
  execute,
  requestTime,
  query,
}) {
  const updateOpenFormsUrl = useUpdateOpenForms(formId);

  // Needed for every POST; the report only runs once it has arrived
  const [csrfToken, setCsrfToken] = useState(null);
  useEffect(() => {
    getNewCsrfToken(setCsrfToken);
  }, []);

  /** Query-builder field definitions (from transformFields). */
  const [fields, setFields] = useState([]);

  /** Grid columns, from toGridColumns. */
  const [reportColumns, setReportColumns] = useState([]);

  /**
   * The query being edited in the query builder. Starts from the URL's query; only becomes the report's
   * query when Run writes it back into the URL.
   */
  const [queryLocal, setQueryLocal] = useState(() => {
    try {
      if (!query) {
        return initialQuery;
      }
      return JSON.parse(query);
    } catch (error) {
      console.error('Invalid query:', error);
      return initialQuery;
    }
  });

  // A link that runs the report opens on the result tab
  const [tabValue, setTabValue] = useState(query && execute ? TABS.RESULT : TABS.QUERY_1);

  /** Result rows of the last run. */
  const [rows, setRows] = useState([]);

  /** True while the report's columns (and with them the query-builder fields) are loading. */
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  /** Error while loading the report's columns; the report can't be used until a reload. */
  const [loadError, setLoadError] = useState('');

  /** Error from the last run, shown on the result tab. */
  const [reportError, setReportError] = useState('');

  /** Which columns are shown, keyed by column field: { [field]: true | false }. */
  const [visibleColumns, setVisibleColumns] = useState({});

  /**
   * Sort order, [{ field, direction: 'asc' | 'desc' }]. Sent with each run but not used yet:
   * the sort tab has no controls and the backend ignores it.
   */
  const [sort, setSort] = useState([]);

  /*
   * Loads the report's columns whenever the report changes (one request), and derives from them both the
   * query-builder fields and the grid columns. The user's column choices are kept where possible.
   */
  useEffect(() => {
    let cancelled = false;
    async function loadColumns() {
      setColumnsLoading(true);
      try {
        const backendColumns = await fetchReportColumnsApi(reportName);
        if (cancelled) {
          return;
        }

        const gridColumns = toGridColumns(backendColumns);
        setFields(transformFields(backendColumns));
        setReportColumns(gridColumns);
        setVisibleColumns((previous) => mergeColumnVisibility(previous, gridColumns));
      } catch (error) {
        console.error('Report columns API error:', error);
        if (!cancelled) {
          setLoadError('تعذر تحميل أعمدة التقرير.');
        }
      } finally {
        if (!cancelled) {
          setColumnsLoading(false);
        }
      }
    }

    if (reportName) {
      loadColumns();
    }

    return () => {
      cancelled = true;
    };
  }, [reportName]);

  /*
   * Column visibility is read through a ref so that checking or unchecking a column doesn't re-run the
   * report: the grid already shows/hides columns itself (see columnDefs), and the request still sends the
   * selection that is current when it runs. Declared before the execute effect so it's updated first.
   */
  const visibleColumnsRef = useRef(visibleColumns);
  useEffect(() => {
    visibleColumnsRef.current = visibleColumns;
  }, [visibleColumns]);

  /*
   * Runs the report when the URL asks for it (execute is set), and again on every Run (requestTime changes).
   * Waits until the columns and the CSRF token have loaded; without the token the request would be rejected.
   * A newer run cancels the result of an older one that is still in flight.
   */
  useEffect(() => {
    let cancelled = false;

    async function executeReport() {
      if (!execute) {
        return;
      }

      setReportLoading(true);
      setReportError('');

      const selectedColumns = reportColumns
        .filter((column) => visibleColumnsRef.current[column.field])
        .map((column) => column.field);

      try {
        // The query comes from the URL (Run writes it there), so the report always matches the open link
        let parsedQuery = initialQuery;
        try {
          if (query) {
            parsedQuery = JSON.parse(query);
          }
        } catch {
          parsedQuery = initialQuery;
        }

        const result = await executeReportApi({
          csrfToken,
          reportName,
          query: parsedQuery,
          columns: selectedColumns,
          sort,
        });

        if (cancelled) {
          return;
        }

        setRows(result);
        setTabValue(TABS.RESULT);
      } catch (error) {
        console.error('Execute report error:', error);

        if (!cancelled) {
          setRows([]);
          setReportError(error?.message ?? 'حدث خطأ أثناء تنفيذ التقرير');
        }
      } finally {
        if (!cancelled) {
          setReportLoading(false);
        }
      }
    }

    if (
      execute &&
      reportColumns.length > 0 &&
      csrfToken
    ) {
      executeReport();
    }

    return () => {
      cancelled = true;
    };
  }, [
    execute,
    requestTime,
    reportName,
    query,
    reportColumns,
    sort,
    csrfToken,
  ]);

  /** AG Grid column definitions; hidden columns stay defined (with hide) so toggling needs no new data. */
  const columnDefs =
    useMemo(() => {
      return reportColumns.map(
        (column) => ({
          field: column.field,
          headerName: column.headerName,
          type: column.type,
          width: column.width,
          minWidth: column.minWidth ?? 100,
          hide: visibleColumns[column.field] === false,
          filter: column.filter ?? true,
          sortable: column.sortable ?? true,
          resizable: column.resizable ?? true,
        })
      );
    }, [
      reportColumns,
      visibleColumns,
    ]);

  /** Defaults for every grid column; flex: 1 lets the columns share the available width. */
  const defaultColDef =
    useMemo(
      () => ({
        minWidth: 100,
        resizable: true,
        sortable: true,
        filter: true,
        flex: 1,
      }),
      []
    );

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  /*
   * The edited query is checked with the same validateReportQuery the report route runs, so Run is only
   * enabled for queries the route would accept. The invalid rules themselves are highlighted by the query
   * builder, so no message is shown. Until the fields have loaded the query can't be checked (every field
   * would count as unknown), so Run stays disabled then too.
   */
  const fieldsLoaded = fields.length > 0;
  const queryProblems = useMemo(
    () => (fieldsLoaded ? validateReportQuery(queryLocal, fields) : []),
    [fieldsLoaded, queryLocal, fields]
  );
  const runDisabled = reportLoading || !fieldsLoaded || queryProblems.length > 0;

  /**
   * Run: writes the edited query into this form's URL with execute=true and a new requestTime.
   * The execute effect reacts to the new URL values and runs the report.
   */
  const handleExecute =
    () => {
      updateOpenFormsUrl(
        `/dashboard/report` +
        `?reportName=${encodeURIComponent(
          reportName
        )}` +
        `&formTitle=${encodeURIComponent(
          formTitle
        )}` +
        `&query=${encodeURIComponent(
          JSON.stringify(
            queryLocal
          )
        )}` +
        `&execute=true` +
        `&requestTime=${Date.now()}`
      );

      setTabValue(TABS.RESULT);
    };

  const handleColumnChange =
    (field) =>
      (event) => {
        const checked = event.target.checked;
        setVisibleColumns(
          (previous) => ({
            ...previous,
            [field]: checked,
          })
        );
      };

  const allColumnsSelected = reportColumns.length > 0 && reportColumns.every((column) => visibleColumns[column.field]);
  const someColumnsSelected = reportColumns.some((column) => visibleColumns[column.field]);

  const handleSelectAll =
    (event) => {
      const checked = event.target.checked;
      const nextState = {};
      reportColumns.forEach(
        (column) => {
          nextState[column.field] = checked;
        }
      );
      setVisibleColumns(nextState);
    };

  const selectedColumnCount = reportColumns.filter((column) => visibleColumns[column.field]).length;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Title and Run button */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          flexShrink: 0,
          p: 1,
        }}
      >
        <Typography
          variant="h6"
          component="div"
          sx={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {formTitle}
        </Typography>

        <Button
          variant="contained"
          size="small"
          onClick={handleExecute}
          disabled={runDisabled}
        >
          {reportLoading ? (
            <CircularProgress
              size={18}
              color="inherit"
            />
          ) : (
            'تنفيذ'
          )}
        </Button>
      </Stack>

      {loadError && (
        <Alert
          severity="error"
          sx={{
            mx: 1,
            mb: 1,
            flexShrink: 0,
          }}
        >
          {loadError}
        </Alert>
      )}

      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="report tabs"
        sx={{
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Tab label="استعلام 1" {...a11yProps(TABS.QUERY_1)} />
        <Tab label="استعلام 2" {...a11yProps(TABS.QUERY_2)} />
        <Tab label={`الأعمدة (${selectedColumnCount})`} {...a11yProps(TABS.COLUMNS)} />
        <Tab label="ترتيب حسب" {...a11yProps(TABS.SORT)} />
        <Tab label="النتيجة" {...a11yProps(TABS.RESULT)} />
      </Tabs>

      {/* Query 1: not implemented yet */}
      <CustomTabPanel
        value={tabValue}
        index={TABS.QUERY_1}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            overflow: 'auto',
          }}
        >
          <Typography variant="h6">
            استعلام 1
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            ضع عناصر الاستعلام الأول هنا.
          </Typography>
        </Box>
      </CustomTabPanel>

      {/*
        Query 2: the query builder; edits apply to the report on the next Run.
        Each field's validator (from transformFields) marks rules with a missing or malformed value as
        .queryBuilder-invalid, which styles.css highlights. No query-level validator is passed, so an
        empty query (all rows) is not marked invalid.
      */}
      <CustomTabPanel
        value={tabValue}
        index={TABS.QUERY_2}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            overflow: 'auto',
          }}
        >
          {columnsLoading ? (
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <QueryBuilder
              fields={fields}
              query={queryLocal}
              onQueryChange={setQueryLocal}
              operators={arabicOperators}
              showNotToggle
            />
          )}
        </Box>
      </CustomTabPanel>

      {/* Columns: choose which columns the result grid shows (applies immediately, no re-run) */}
      <CustomTabPanel
        value={tabValue}
        index={TABS.COLUMNS}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            overflow: 'auto',
          }}
        >
          <Typography
            variant="h6"
            sx={{ mb: 1 }}
          >
            اختيار الأعمدة
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            اختر الأعمدة التي ستظهر في نتيجة التقرير.
          </Typography>

          {columnsLoading && (
            <Box
              sx={{
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={18} />
              <Typography
                variant="body2"
                color="text.secondary"
              >
                تحميل الأعمدة...
              </Typography>
            </Box>
          )}

          <Divider sx={{ mb: 1 }} />

          <FormControlLabel
            label="تحديد الكل"
            control={
              <Checkbox
                checked={allColumnsSelected}
                indeterminate={someColumnsSelected && !allColumnsSelected}
                onChange={handleSelectAll}
              />
            }
          />

          <Divider sx={{ mb: 1 }} />

          <FormGroup>
            {reportColumns.map(
              (column) => (
                <FormControlLabel
                  key={column.field}
                  label={column.headerName}
                  control={
                    <Checkbox
                      checked={Boolean(visibleColumns[column.field])}
                      onChange={handleColumnChange(column.field)}
                    />
                  }
                />
              )
            )}
          </FormGroup>
        </Box>
      </CustomTabPanel>

      {/* Sort: not implemented yet (see the sort state) */}
      <CustomTabPanel
        value={tabValue}
        index={TABS.SORT}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            overflow: 'auto',
          }}
        >
          <Typography
            variant="h6"
            sx={{ mb: 1 }}
          >
            ترتيب حسب
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
          >
            أضف إعدادات الترتيب هنا.
          </Typography>
        </Box>
      </CustomTabPanel>

      {/* Result: run errors, progress and the result grid */}
      <CustomTabPanel
        value={tabValue}
        index={TABS.RESULT}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {reportError && (
            <Alert
              severity="error"
              onClose={() => setReportError('')}
              sx={{
                mb: 1,
                flexShrink: 0,
              }}
            >
              {reportError}
            </Alert>
          )}

          {reportLoading && (
            <Box
              sx={{
                mb: 1,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress
                size={18}
              />
              <Typography
                variant="body2"
                color="text.secondary"
              >
                جاري تنفيذ التقرير...
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <AgGridProvider
              modules={modules}
            >
              <AgGridReact
                rowData={rows}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                animateRows={true}
                enableRtl={true}
              />
            </AgGridProvider>
          </Box>
        </Box>
      </CustomTabPanel>
    </Box>
  );
}
