'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { AuthContext } from '@/components/AuthProvider';
import { useOpenLink } from '@/utils/useOpenLink';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import {
  paramOrderProblem, parseJsonObject, parseReportSort, selectReportParams, selectReportSort, transformFields,
  validateReportParams, validateReportQuery,
} from '@/utils/reportutils';
import { executeReport, fetchReportMetadata } from './reportApi';
import { gridColumnDefs, mergeColumnVisibility, toGridColumns } from './reportGrid';
import {
  ColumnsTab, ParamsTab, QueryTab, ResultTab, SortTab, TabPanel, TABS, tabProps,
} from './ReportTabs';

/** The query used when the URL has none (or an unreadable one): no conditions, i.e. all rows. */
const INITIAL_QUERY = { combinator: 'and', rules: [] };

/**
 * The report's URL as Run writes it: its params, query and sort, and a new requestTime, so the same query runs again.
 */
function runUrl({ reportName, formTitle, params, query, sort }) {
  const parts = [
    `reportName=${encodeURIComponent(reportName)}`,
    `formTitle=${encodeURIComponent(formTitle)}`,
    `params=${encodeURIComponent(JSON.stringify(params))}`,
    `query=${encodeURIComponent(JSON.stringify(query))}`,
    `sort=${encodeURIComponent(JSON.stringify(sort))}`,
    'execute=true',
    `requestTime=${Date.now()}`,
  ];
  return `/dashboard/report?${parts.join('&')}`;
}

/**
 * Loads the report's metadata whenever the report changes (one request): its params, the query builder's fields and
 * the grid's columns. onLoaded runs with the metadata and the grid columns.
 */
function useReportMetadata(reportName, onLoaded) {
  const [metadata, setMetadata] = useState(null);
  const [fields, setFields] = useState([]);
  const [reportColumns, setReportColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (!reportName) {
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loaded = await fetchReportMetadata(reportName);
        if (cancelled) {
          return;
        }
        const gridColumns = toGridColumns(loaded.columns);
        setMetadata(loaded);
        setFields(transformFields(loaded.columns.filter((column) => column.filterable)));
        setReportColumns(gridColumns);
        onLoadedRef.current(loaded, gridColumns);
      } catch (error) {
        console.error('Report metadata API error:', error);
        if (!cancelled) {
          setLoadError(error.fromBackend ? error.message : 'تعذر تحميل التقرير.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reportName]);

  return { metadata, fields, reportColumns, loading, loadError };
}

/**
 * Report screen: enter the report's params, build a filter with the query builder, choose which columns to show and
 * which columns to sort by, run the report and see the result in a grid.
 *
 * The report's state lives in its dashboard URL (updated through useUpdateOpenForms), so a report link can be reopened
 * or shared and runs itself again:
 * - `params`: the report's param values (search params 1), JSON-encoded
 * - `query`: the query-builder query (search params 2), JSON-encoded
 * - `sort`: the columns to sort by, [{ column, direction }] most important first, JSON-encoded; none for a report with
 *   a fixed order (its metadata's fixedOrder), whose rows come in the report's own order
 * - `execute`: "true" once the report has been run
 * - `requestTime`: set on every Run, so running the same query again still triggers a new run
 *
 * Flow:
 * 1. On load, the report's metadata is fetched from the backend once: the params form, the query-builder fields, the
 *    sort tab's columns and the grid columns all come from it.
 * 2. Run checks the params, then writes them, the query and the sort into the URL; the run effect sees the new URL
 *    values and runs the report.
 * 3. The rows are shown in AG Grid. Showing or hiding columns happens in the grid only and doesn't re-run. Linked
 *    columns open the row's record (see reportGrid's LinkCell).
 *
 * All props come from the dashboard URL's search parameters, so they are strings.
 */
export default function Report({ formId, formTitle, reportName, execute, requestTime, params, query, sort }) {
  const updateOpenFormsUrl = useUpdateOpenForms(formId);
  const shouldExecute = execute === 'true';
  // Needed for every POST; shared by the dashboard (AuthProvider). The report only runs once it has arrived.
  const { csrfFetch } = useContext(AuthContext);
  const openLink = useOpenLink();

  // A link that runs the report opens on the result tab
  const [tabValue, setTabValue] = useState(shouldExecute ? TABS.RESULT : TABS.QUERY_1);
  /** Which columns are shown, keyed by column field: { [field]: true | false }. */
  const [visibleColumns, setVisibleColumns] = useState({});

  // The sort being edited: it starts from the URL, and becomes the report's when Run writes it back
  const [sortLocal, setSortLocal] = useState(() => parseReportSort(sort));

  const { metadata, fields, reportColumns, loading: metadataLoading, loadError } = useReportMetadata(reportName,
    (loaded, gridColumns) => {
      // The user's column choices are kept where the columns still exist
      setVisibleColumns((previous) => mergeColumnVisibility(previous, gridColumns));
      // And the sort, where its columns may still be sorted by
      setSortLocal((previous) => selectReportSort(previous, loaded.columns, loaded.fixedOrder));
      // A report without params has nothing on the first tab: start on the query builder instead
      if (loaded.params.length === 0) {
        setTabValue((current) => (current === TABS.QUERY_1 ? TABS.QUERY_2 : current));
      }
    });
  const paramFields = useMemo(() => metadata?.params ?? [], [metadata]);

  // The params and the query being edited: they start from the URL, and become the report's when Run writes them back
  const [paramValues, setParamValues] = useState(() => parseJsonObject(params, {}));
  const [queryLocal, setQueryLocal] = useState(() => parseJsonObject(query, INITIAL_QUERY));
  // Each param's validity (shown by FormFields), and whether Run was clicked with invalid params (and why, when the
  // fields alone can't say: a period ending before it starts)
  const [paramValidity, setParamValidity] = useState({});
  const [showParamErrors, setShowParamErrors] = useState(false);
  const [paramsProblem, setParamsProblem] = useState('');

  // What's being edited is read again when the URL's values change (Back, Forward), so the tabs show what the rows
  // are of. Set during render, so they never show the old values first:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [editedFrom, setEditedFrom] = useState({ params, query, sort });
  if (params !== editedFrom.params || query !== editedFrom.query || sort !== editedFrom.sort) {
    setEditedFrom({ params, query, sort });
    setParamValues(parseJsonObject(params, {}));
    setQueryLocal(parseJsonObject(query, INITIAL_QUERY));
    setSortLocal(metadata ? selectReportSort(parseReportSort(sort), metadata.columns, metadata.fixedOrder)
      : parseReportSort(sort));
  }

  const [rows, setRows] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // Read through a ref so that checking or unchecking a column doesn't re-run the report: the grid shows and hides
  // columns itself, and a run still sends the selection current when it runs. Declared before the run effect so it's
  // updated first.
  const visibleColumnsRef = useRef(visibleColumns);
  useEffect(() => {
    visibleColumnsRef.current = visibleColumns;
  }, [visibleColumns]);

  // Runs the report when the URL asks for it (execute is "true"), and again on every Run (requestTime changes), once
  // the metadata and the CSRF token have loaded (without the token the request would be refused). A newer run
  // discards the result of an older one still in flight.
  useEffect(() => {
    if (!shouldExecute || !metadata) {
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      setReportLoading(true);
      setReportError('');
      const selectedColumns = reportColumns
        .filter((column) => visibleColumnsRef.current[column.field])
        .map((column) => column.field);
      try {
        // The params, query and sort come from the URL (Run writes them there), so the report always matches the link
        const result = await executeReport({
          csrfFetch,
          reportName,
          query: parseJsonObject(query, INITIAL_QUERY),
          reportParams: parseJsonObject(params, {}),
          columns: selectedColumns,
          sort: selectReportSort(parseReportSort(sort), metadata.columns, metadata.fixedOrder),
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
    };
    run();
    return () => {
      cancelled = true;
      // The cancelled run no longer clears the spinner; a newer run sets it again
      setReportLoading(false);
    };
  }, [shouldExecute, requestTime, reportName, params, query, metadata, reportColumns, sort, csrfFetch]);

  const columnDefs = useMemo(() => gridColumnDefs(reportColumns, visibleColumns, openLink),
    [reportColumns, visibleColumns, openLink]);

  // The edited query is checked with the same validateReportQuery the report route runs, so Run is only enabled for
  // queries the route would accept (the query builder highlights the invalid rules). Until the metadata has loaded
  // the query can't be checked (every field would count as unknown), so Run stays off then too.
  const queryProblems = useMemo(() => (metadata ? validateReportQuery(queryLocal, fields) : []),
    [metadata, queryLocal, fields]);
  const runDisabled = reportLoading || !metadata || queryProblems.length > 0;

  /**
   * Run: checks the params (invalid ones are shown on the params tab), then writes the params, the edited query and
   * the sort into this form's URL with execute=true and a new requestTime; the run effect reacts to the new URL
   * values.
   */
  const handleRun = () => {
    const validity = validateReportParams(paramFields, paramValues);
    setParamValidity(validity);
    if (!Object.values(validity).every(Boolean)) {
      setShowParamErrors(true);
      setParamsProblem(paramOrderProblem(paramFields, paramValues) ?? '');
      setTabValue(TABS.QUERY_1);
      return;
    }
    setParamsProblem('');
    updateOpenFormsUrl(runUrl({
      reportName,
      formTitle,
      params: selectReportParams(paramFields, paramValues),
      query: queryLocal,
      sort: selectReportSort(sortLocal, metadata.columns, metadata.fixedOrder),
    }));
    setTabValue(TABS.RESULT);
  };

  const selectedColumnCount = reportColumns.filter((column) => visibleColumns[column.field]).length;

  return <Box sx={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex',
    flexDirection: 'column', overflow: 'hidden' }}>
    {/* Title and Run button */}
    <Stack direction="row" spacing={1} sx={{ flexShrink: 0, p: 1 }}>
      <Typography variant="h6" component="div" sx={{ flex: 1, minWidth: 0 }}>{formTitle}</Typography>
      <Button variant="contained" size="small" onClick={handleRun} disabled={runDisabled}>
        {reportLoading ? <CircularProgress size={18} color="inherit" /> : 'تنفيذ'}
      </Button>
    </Stack>

    {loadError && <Alert severity="error" sx={{ mx: 1, mb: 1, flexShrink: 0 }}>{loadError}</Alert>}
    {paramsProblem && <Alert severity="error" onClose={() => setParamsProblem('')} sx={{ mx: 1, mb: 1, flexShrink: 0 }}>
      {paramsProblem}
    </Alert>}

    <Tabs value={tabValue} onChange={(event, next) => setTabValue(next)} variant="scrollable" scrollButtons="auto"
      aria-label="report tabs" sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
      <Tab label="استعلام 1" {...tabProps(TABS.QUERY_1)} />
      <Tab label="استعلام 2" {...tabProps(TABS.QUERY_2)} />
      <Tab label={`الأعمدة (${selectedColumnCount})`} {...tabProps(TABS.COLUMNS)} />
      <Tab label={sortLocal.length > 0 ? `ترتيب حسب (${sortLocal.length})` : 'ترتيب حسب'} {...tabProps(TABS.SORT)} />
      <Tab label="النتيجة" {...tabProps(TABS.RESULT)} />
    </Tabs>

    <TabPanel value={tabValue} index={TABS.QUERY_1}>
      <ParamsTab loading={metadataLoading} paramFields={paramFields} paramValues={paramValues}
        setParamValues={setParamValues} paramValidity={paramValidity} setParamValidity={setParamValidity}
        showParamErrors={showParamErrors} />
    </TabPanel>
    <TabPanel value={tabValue} index={TABS.QUERY_2}>
      <QueryTab loading={metadataLoading} fields={fields} query={queryLocal} setQuery={setQueryLocal} />
    </TabPanel>
    <TabPanel value={tabValue} index={TABS.COLUMNS}>
      <ColumnsTab loading={metadataLoading} reportColumns={reportColumns} visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns} />
    </TabPanel>
    <TabPanel value={tabValue} index={TABS.SORT}>
      {/* Loading until the metadata is in: a sort from the URL names columns the tab can't offer before that */}
      <SortTab loading={metadataLoading || !metadata} fixedOrder={metadata?.fixedOrder === true} reportColumns={reportColumns}
        sort={sortLocal} setSort={setSortLocal} />
    </TabPanel>
    <TabPanel value={tabValue} index={TABS.RESULT}>
      <ResultTab reportError={reportError} onCloseError={() => setReportError('')} reportLoading={reportLoading}
        rows={rows} columnDefs={columnDefs} totals={metadata?.totals ?? null} />
    </TabPanel>
  </Box>;
}
