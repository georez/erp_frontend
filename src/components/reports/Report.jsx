'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
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

import FormFields from '@/components/forms/FormFields';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { openLinkOnPlainClick, useOpenLink } from '@/utils/useOpenLink';
import { CONNECTION_ERROR_MESSAGE } from '@/utils/sendOrShowError';
import { readErrorMessage } from '@/utils/fetchJson';

import {
  transformFields,
  arabicOperators,
  validateReportQuery,
  parseJsonObject,
  selectReportParams,
  validateReportParams,
  buildLinkUrl,
  compareDecimalCells,
  cellFilterNumber,
} from '@/utils/reportutils';
import { AuthContext } from '@/components/AuthProvider';

const modules = [AllCommunityModule];
const NUMBER_CELL = { direction: 'ltr' };

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
  QUERY_1: 0, // the report's own params (search params 1)
  QUERY_2: 1, // the query builder: filters on the result's columns (search params 2)
  COLUMNS: 2,
  SORT: 3,    // not implemented yet
  RESULT: 4,
};

/**
 * Loads the report's metadata from the backend: its params (search params 1, shaped like CRUD form fields)
 * and its output columns, which serve both the query builder (the filterable ones, see transformFields) and
 * the result grid (all of them, see toGridColumns).
 *
 * @param {string} reportName
 * @returns {Promise<{title: string, params: Array<object>, columns: Array<{name: string, label: string,
 *   inputType?: string, valueEditorType?: string, filterable: boolean,
 *   link?: {schemaName: string, idColumn: string, formTitle: string}}>}>}
 */
async function fetchReportMetadataApi(
  reportName
) {
  const response = await fetch(
    `/api/report/${encodeURIComponent(reportName)}/metadata`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    // The backend's reason, in Arabic (a report that doesn't exist...), for the screen to show
    const error = new Error(await readErrorMessage(response));
    error.fromBackend = true;
    throw error;
  }

  return response.json();
}

/**
 * Turns the backend's column list into the result grid's columns. Width, filtering, sorting and resizing
 * are left to the grid defaults (see columnDefs and defaultColDef).
 *
 * @param {Array<{name: string, label?: string, inputType?: string, link?: object}>} backendColumns
 * @returns {Array<{field: string, headerName: string, visibleByDefault: boolean, type: string|null, link: object|null}>}
 *   `type` is 'numericColumn' for numbers (right-aligned in AG Grid), otherwise null
 */
function toGridColumns(backendColumns) {
  return backendColumns.map((column) => ({
    field: column.name,
    headerName: column.label ?? column.name,
    visibleByDefault: true,
    type: column.inputType === 'number' ? 'numericColumn' : null,
    link: column.link ?? null,
  }));
}

/**
 * Runs the report through the Next.js route /custom/api/report/{reportName}/execute. That route checks the
 * query against the report's columns, turns it into parameterized SQL, signs the request and forwards it to
 * the backend, which runs it as a read-only database role.
 *
 * `columns` and `sort` are sent for future use; the route and backend currently ignore them and return every
 * column, unsorted.
 *
 * @param {object} args
 * @param {Function} args.csrfFetch  sends the CSRF token the proxy requires for the POST (from AuthContext)
 * @param {string} args.reportName
 * @param {object} args.query  react-querybuilder query (search params 2)
 * @param {object} args.reportParams  the report's param values by name (search params 1)
 * @param {string[]} args.columns  fields of the currently visible columns
 * @param {Array<{field: string, direction: 'asc'|'desc'}>} args.sort
 * @returns {Promise<Array<object>>} every result row, one object per row keyed by column field
 * @throws {Error} with the route's error message when the request fails, or CONNECTION_ERROR_MESSAGE when the
 *   server can't be reached (network failure, or no CSRF token could be obtained)
 */
async function executeReportApi({
  csrfFetch,
  reportName,
  query,
  reportParams,
  columns,
  sort,
}) {
  let response;
  try {
    response = await csrfFetch(
      `/custom/api/report/${encodeURIComponent(reportName)}/execute`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          reportParams,
          columns,
          sort,
        }),
      }
    );
  } catch (error) {
    // The same message the forms show (sendOrShowError), instead of the technical one
    console.error('Report request failed:', error);
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

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

  if (Array.isArray(data?.rows)) {
    return data.rows;
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
 * Grid cell of a linked column: opens the record the row points to (see the column's link in the report
 * metadata), as a new dashboard window or a new browser tab (see useOpenLink).
 *
 * @param {object} props  AG Grid cell renderer props, plus cellRendererParams `link` and `openLink`
 *   (from useOpenLink)
 */
function LinkCell({ value, data, link, openLink }) {
  const text = value === null || value === undefined ? '' : String(value);
  const url = buildLinkUrl(link, data);
  if (!url) {
    return text;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => openLinkOnPlainClick(event, openLink, url, link.formTitle)}
    >
      {text}
    </a>
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
 * Report screen: enter the report's params, build a filter with the query builder, choose which columns to
 * show, run the report and see the result in a grid.
 *
 * The report's state lives in its dashboard URL (updated through useUpdateOpenForms), so a report link can be
 * reopened or shared and runs itself again:
 * - `params`: the report's param values (search params 1), JSON-encoded
 * - `query`: the query-builder query (search params 2), JSON-encoded
 * - `execute`: "true" once the report has been run
 * - `requestTime`: set on every Run, so running the same query again still triggers a new run
 *
 * Flow:
 * 1. On load, the report's metadata is fetched from the backend once: the params form, the query-builder
 *    fields and the grid columns all come from it.
 * 2. Run checks the params, then writes them and the query into the URL; the execute effect sees the new
 *    URL values and runs the report.
 * 3. The rows are shown in AG Grid. Showing or hiding columns happens in the grid only and doesn't re-run.
 *    Linked columns open the row's record (see LinkCell).
 *
 * All props come from the dashboard URL's search parameters, so they are strings.
 *
 * @param {object} props
 * @param {string} props.formId  id of this open form in the dashboard, used to update its URL
 * @param {string} props.formTitle
 * @param {string} props.reportName  backend report name (its folder in the backend's resources/reports)
 * @param {string} [props.execute]  "true" to run the report
 * @param {string} [props.requestTime]  time of the last Run
 * @param {string} [props.params]  JSON-encoded param values
 * @param {string} [props.query]  JSON-encoded react-querybuilder query
 */
export default function Report({
  formId,
  formTitle,
  reportName,
  execute,
  requestTime,
  params,
  query,
}) {
  const updateOpenFormsUrl = useUpdateOpenForms(formId);
  const shouldExecute = execute === 'true';

  // Needed for every POST; shared by the dashboard (AuthProvider). The report only runs once it has arrived.
  const { csrfFetch } = useContext(AuthContext);

  /** The report's metadata (fetchReportMetadataApi); null until loaded. */
  const [metadata, setMetadata] = useState(null);

  /** Query-builder field definitions (from transformFields). */
  const [fields, setFields] = useState([]);

  /** Grid columns, from toGridColumns. */
  const [reportColumns, setReportColumns] = useState([]);

  /** The report's params as form fields; empty until loaded. */
  const paramFields = useMemo(() => metadata?.params ?? [], [metadata]);

  /**
   * The param values being edited, and the query being edited in the query builder. Both start from the
   * URL; they only become the report's params and query when Run writes them back into the URL.
   */
  const [paramValues, setParamValues] = useState(() => parseJsonObject(params, {}));
  const [queryLocal, setQueryLocal] = useState(() => parseJsonObject(query, initialQuery));

  /** Validity of each param (shown by FormFields), and whether Run was clicked with invalid params. */
  const [paramValidity, setParamValidity] = useState({});
  const [showParamErrors, setShowParamErrors] = useState(false);

  // A link that runs the report opens on the result tab
  const [tabValue, setTabValue] = useState(shouldExecute ? TABS.RESULT : TABS.QUERY_1);

  /** Result rows of the last run. */
  const [rows, setRows] = useState([]);

  /** True while the report's metadata is loading. */
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  /** Error while loading the report's metadata; the report can't be used until a reload. */
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
   * Loads the report's metadata whenever the report changes (one request), and derives from it the
   * query-builder fields and the grid columns. The user's column choices are kept where possible.
   */
  useEffect(() => {
    let cancelled = false;
    async function loadMetadata() {
      setMetadataLoading(true);
      setLoadError('');
      try {
        const loaded = await fetchReportMetadataApi(reportName);
        if (cancelled) {
          return;
        }

        const gridColumns = toGridColumns(loaded.columns);
        setMetadata(loaded);
        setFields(transformFields(loaded.columns.filter((column) => column.filterable)));
        setReportColumns(gridColumns);
        setVisibleColumns((previous) => mergeColumnVisibility(previous, gridColumns));
        // A report without params has nothing on the first tab: start on the query builder instead
        if (loaded.params.length === 0) {
          setTabValue((current) => (current === TABS.QUERY_1 ? TABS.QUERY_2 : current));
        }
      } catch (error) {
        console.error('Report metadata API error:', error);
        if (!cancelled) {
          setLoadError(error.fromBackend ? error.message : 'تعذر تحميل التقرير.');
        }
      } finally {
        if (!cancelled) {
          setMetadataLoading(false);
        }
      }
    }

    if (reportName) {
      loadMetadata();
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
   * Runs the report when the URL asks for it (execute is "true"), and again on every Run (requestTime
   * changes). Waits until the metadata and the CSRF token have loaded; without the token the request would
   * be rejected. A newer run cancels the result of an older one that is still in flight.
   */
  useEffect(() => {
    let cancelled = false;

    async function executeReport() {
      setReportLoading(true);
      setReportError('');

      const selectedColumns = reportColumns
        .filter((column) => visibleColumnsRef.current[column.field])
        .map((column) => column.field);

      try {
        // The params and query come from the URL (Run writes them there), so the report always matches
        // the open link
        const result = await executeReportApi({
          csrfFetch,
          reportName,
          query: parseJsonObject(query, initialQuery),
          reportParams: parseJsonObject(params, {}),
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
      shouldExecute &&
      metadata
    ) {
      executeReport();
    }

    return () => {
      cancelled = true;
      // The cancelled run no longer clears the spinner; a newer run sets it again
      setReportLoading(false);
    };
  }, [
    shouldExecute,
    requestTime,
    reportName,
    params,
    query,
    metadata,
    reportColumns,
    sort,
    csrfFetch,
  ]);

  /** Opens linked cells as a new dashboard window, or null when they open in a new tab. */
  const openLink = useOpenLink();

  /** AG Grid column definitions; hidden columns stay defined (with hide) so toggling needs no new data. */
  const columnDefs =
    useMemo(() => {
      return reportColumns.map(
        (column) => ({
          field: column.field,
          headerName: column.headerName,
          type: column.type,
          ...(column.type === 'numericColumn' && {
            // Numbers left to right inside the right-to-left grid, so a sign stays in front ("-7.5", not "7.5-");
            // still aligned as before (the grid aligns numeric cells with an absolute text-align)
            cellStyle: NUMBER_CELL,
            // Exact values: numeric and bigint come as decimal text (shown as sent), sorted by value, not as text.
            // The grid mustn't guess the column's type from the text either.
            cellDataType: false,
            comparator: compareDecimalCells,
            filter: 'agNumberColumnFilter',
            filterValueGetter: ({ data, colDef }) => cellFilterNumber(data[colDef.field]),
          }),
          hide: visibleColumns[column.field] === false,
          ...(column.link && {
            cellRenderer: LinkCell,
            cellRendererParams: { link: column.link, openLink },
          }),
        })
      );
    }, [
      reportColumns,
      visibleColumns,
      openLink,
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
   * builder, so no message is shown. Until the metadata has loaded the query can't be checked (every field
   * would count as unknown), so Run stays disabled then too.
   */
  const metadataLoaded = metadata !== null;
  const queryProblems = useMemo(
    () => (metadataLoaded ? validateReportQuery(queryLocal, fields) : []),
    [metadataLoaded, queryLocal, fields]
  );
  const runDisabled = reportLoading || !metadataLoaded || queryProblems.length > 0;

  /**
   * Run: checks the params (invalid ones are shown on the params tab), then writes the params and the edited
   * query into this form's URL with execute=true and a new requestTime. The execute effect reacts to the new
   * URL values and runs the report.
   */
  const handleExecute =
    () => {
      const validity = validateReportParams(paramFields, paramValues);
      setParamValidity(validity);
      if (!Object.values(validity).every(Boolean)) {
        setShowParamErrors(true);
        setTabValue(TABS.QUERY_1);
        return;
      }

      updateOpenFormsUrl(
        `/dashboard/report` +
        `?reportName=${encodeURIComponent(
          reportName
        )}` +
        `&formTitle=${encodeURIComponent(
          formTitle
        )}` +
        `&params=${encodeURIComponent(
          JSON.stringify(
            selectReportParams(paramFields, paramValues)
          )
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

      {/* Query 1: the report's own params, with the same fields and checks as the CRUD forms */}
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
          {metadataLoading ? (
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <CircularProgress />
            </Box>
          ) : paramFields.length === 0 ? (
            <Typography color="text.secondary">
              لا توجد معايير لهذا التقرير.
            </Typography>
          ) : (
            <Stack
              spacing={2}
              sx={{
                maxWidth: 480,
                pt: 1,
              }}
            >
              <FormFields
                formFields={paramFields}
                formValues={paramValues}
                setFormValues={setParamValues}
                isValid={paramValidity}
                setIsValid={setParamValidity}
                tryToSubmit={showParamErrors}
              />
            </Stack>
          )}
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
          {metadataLoading ? (
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

          {metadataLoading && (
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
                enableRtl
                // Let users select and copy cell text (the grid blocks selection by default).
                // ensureDomOrder keeps cells in DOM order so a selection across cells copies in order.
                enableCellTextSelection
                ensureDomOrder
              />
            </AgGridProvider>
          </Box>
        </Box>
      </CustomTabPanel>
    </Box>
  );
}
