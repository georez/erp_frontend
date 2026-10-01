'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import {
  defaultValidator,
} from 'react-querybuilder';

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
} from '@/utils/reportutils';
import { CSRF_HEADER_NAME } from '@/constants';
import { getNewCsrfToken } from '@/utils/csrfClientUtils';

const modules = [AllCommunityModule];
const QueryBuilder = dynamic(
  () =>
    import('react-querybuilder').then(
      (mod) => mod.QueryBuilder
    ),
  {
    ssr: false,
  }
);
const initialQuery = {
  combinator: 'and',
  rules: [],
};

/*
|--------------------------------------------------------------------------
| FALLBACK COLUMNS
|--------------------------------------------------------------------------
|
| Used until your API returns real column definitions.
|
| Your API can eventually return something like:
|
| [
|   {
|     field: 'make',
|     headerName: 'الشركة',
|     visibleByDefault: true
|   }
| ]
|
*/

const fallbackColumns = [
  {
    field: 'make',
    headerName: 'الشركة',
    visibleByDefault: true,
    type: undefined,
    width: 150,
  },
  {
    field: 'model',
    headerName: 'الموديل',
    visibleByDefault: true,
    type: undefined,
    width: 150,
  },
  {
    field: 'price',
    headerName: 'السعر',
    visibleByDefault: true,
    type: 'numericColumn',
    width: 120,
  },
  {
    field: 'electric',
    headerName: 'كهربائية',
    visibleByDefault: false,
    type: undefined,
    width: 120,
  },
];

/*
|--------------------------------------------------------------------------
| FALLBACK DATA
|--------------------------------------------------------------------------
|
| Remove this when your execute API is ready.
|
*/

const fallbackRows = [
  {
    make: 'Tesla',
    model: 'Model Y',
    price: 64950,
    electric: true,
  },
  {
    make: 'Ford',
    model: 'F-Series',
    price: 33850,
    electric: false,
  },
  {
    make: 'Toyota',
    model: 'Corolla',
    price: 29600,
    electric: false,
  },
  {
    make: 'Mercedes',
    model: 'EQA',
    price: 48890,
    electric: true,
  },
  {
    make: 'Fiat',
    model: '500',
    price: 15774,
    electric: false,
  },
  {
    make: 'Nissan',
    model: 'Juke',
    price: 20675,
    electric: false,
  },
];

/*
|--------------------------------------------------------------------------
| API PLACEHOLDERS
|--------------------------------------------------------------------------
|
| Replace the URLs and response handling here with your backend.
|
| There are three API operations:
|
| 1. Get query-builder fields
| 2. Get report columns
| 3. Execute report
|
|--------------------------------------------------------------------------
*/

async function fetchReportFieldsApi(
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
      `Failed to load fields (${response.status})`
    );
  }

  return response.json();
}

/*
|--------------------------------------------------------------------------
| 2. GET REPORT COLUMNS
|--------------------------------------------------------------------------
|
| PLACEHOLDER API
|
| Suggested response:
|
| [
|   {
|     field: "make",
|     headerName: "الشركة",
|     visibleByDefault: true,
|     type: null,
|     width: 150
|   },
|   {
|     field: "model",
|     headerName: "الموديل",
|     visibleByDefault: true
|   }
| ]
|
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
      `Failed to load columns (${response.status})`
    );
  }

  const data = await response.json();
  return data.map(field => ({
    field: field.name,
    headerName: field.label,
    visibleByDefault: true,
    type: field.inputType === 'number' ? 'numericColumn' : null
  }));

}

/*
|--------------------------------------------------------------------------
| 3. EXECUTE REPORT
|--------------------------------------------------------------------------
|
| PLACEHOLDER API
|
| Suggested request:
|
| POST /internal/report/{reportName}/execute
|
| Body:
|
| {
|   query: {...},
|   columns: ["make", "model", "price"],
|   sort: [...]
| }
|
| Suggested response:
|
| {
|   rows: [
|     {
|       make: "Tesla",
|       model: "Model Y",
|       price: 64950
|     }
|   ]
| }
|
|--------------------------------------------------------------------------
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
      // Ignore invalid error response.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  /*
   * Support:
   *
   * {
   *   rows: [...]
   * }
   *
   * or:
   *
   * [...]
   */

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

/*
|--------------------------------------------------------------------------
| TAB PANEL
|--------------------------------------------------------------------------
*/

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

function a11yProps(index) {
  return {
    id: `report-tab-${index}`,
    'aria-controls': `report-tabpanel-${index}`,
  };
}

export default function Report({
  formId,
  formTitle,
  reportName,
  execute,
  requestTime,
  query,
}) {
  const updateOpenFormsUrl = useUpdateOpenForms(formId);

  const [csrfToken, setCsrfToken] = useState(null);
  useEffect(() => {
      getNewCsrfToken(setCsrfToken);
    }, []);
  /*
   * ==========================================================
   * QueryBuilder fields
   * ==========================================================
   */

  const [fields, setFields] = useState([]);

  /*
   * ==========================================================
   * Report columns
   * ==========================================================
   */

  const [reportColumns, setReportColumns] = useState([]);
  // useState(fallbackColumns);

  /*
   * ==========================================================
   * Query
   * ==========================================================
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

  /*
   * ==========================================================
   * Current tab
   *
   * 0 = Query 1
   * 1 = Query 2
   * 2 = Columns
   * 3 = Sort
   * 4 = Result
   * ==========================================================
   */

  const [tabValue, setTabValue] = useState(query && execute ? 4 : 0);

  /*
   * ==========================================================
   * Result rows
   * ==========================================================
   */

  const [rows, setRows] = useState([]);

  /*
   * ==========================================================
   * Loading states
   * ==========================================================
   */

  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  /*
   * ==========================================================
   * Errors
   * ==========================================================
   */

  const [reportError, setReportError] = useState('');

  /*
   * ==========================================================
   * Column visibility
   * ==========================================================
   *
   * {
   *   make: true,
   *   model: true,
   *   price: true,
   *   electric: false
   * }
   *
   */

  const [visibleColumns, setVisibleColumns] = useState({});

  /*
   * ==========================================================
   * Sorting
   * ==========================================================
   *
   * Placeholder for your future "ترتيب حسب" tab.
   *
   * Example:
   *
   * [
   *   {
   *     field: 'price',
   *     direction: 'desc'
   *   }
   * ]
   *
   */

  const [sort, setSort] = useState([]);

  /*
   * ==========================================================
   * LOAD QUERY BUILDER FIELDS
   * ==========================================================
   */
  useEffect(() => {
    let cancelled = false;
    async function loadFields() {
      setFieldsLoading(true);
      try {
        const data = await fetchReportFieldsApi(reportName);
        if (cancelled) {
          return;
        }
        setFields(transformFields(data));
      } catch (error) {
        console.error('Fields API error:', error);
      } finally {
        if (!cancelled) {
          setFieldsLoading(false);
        }
      }
    }

    if (reportName) {
      loadFields();
    }

    return () => {
      cancelled = true;
    };
  }, [reportName]);

  /*
   * ==========================================================
   * LOAD REPORT COLUMNS
   * ==========================================================
   */

  useEffect(() => {
    let cancelled = false;
    async function loadColumns() {
      setColumnsLoading(true);
      try {
        const data = await fetchReportColumnsApi(reportName);
        if (cancelled) {
          return;
        }

        /*
         * Normalize the API response.
         */

        const normalized = data.map(
          (column) => ({
            field: column.field,
            headerName: column.headerName ?? column.label ?? column.field,
            visibleByDefault: column.visibleByDefault ?? true,
            type: column.type,
            width: column.width,
            minWidth: column.minWidth,
            filter: column.filter ?? true,
            sortable: column.sortable ?? true,
            resizable: column.resizable ?? true,
          })
        );

        setReportColumns(normalized);
      } catch (error) {
        /*
         * Keep the fallback columns.
         *
         * This is useful while the API is
         * still being implemented.
         */

        console.warn('Columns API unavailable. Using fallback columns.', error);
        if (!cancelled) {
          setReportColumns(fallbackColumns);
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
   * ==========================================================
   * INITIALIZE COLUMN VISIBILITY
   * ==========================================================
   */

  useEffect(() => {
    setVisibleColumns(
      (previous) => {
        const next = {};

        reportColumns.forEach(
          (column) => {
            /*
             * Preserve user's current
             * selection if it already exists.
             */
            if (Object.prototype.hasOwnProperty.call(previous, column.field)) {
              next[column.field] = previous[column.field];
            } else {
              next[column.field] = column.visibleByDefault !== false;
            }
          }
        );

        return next;
      }
    );
  }, [reportColumns]);

  /*
   * ==========================================================
   * EXECUTE REPORT
   * ==========================================================
   *
   * This is triggered when:
   *
   * execute === true
   *
   * and requestTime changes.
   *
   * That means your existing URL-driven
   * architecture continues to work.
   * ==========================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function executeReport() {
      if (!execute) {
        return;
      }

      setReportLoading(true);
      setReportError('');

      /*
       * Get only currently visible columns.
       */

      const selectedColumns = reportColumns
        .filter((column) => visibleColumns[column.field])
        .map((column) => column.field);

      try {
        /*
         * Query can come from the URL.
         */

        let parsedQuery = initialQuery;
        try {
          if (query) {
            parsedQuery = JSON.parse(query);
          }
        } catch {
          parsedQuery = queryLocal;
        }

        /*
         * Call your API.
         */

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

        /*
         * Automatically show result tab.
         */

        setTabValue(4);
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

    /*
     * Only execute once the column
     * definitions are available.
     */

    if (
      execute &&
      reportColumns.length > 0
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
    visibleColumns,
    sort,
  ]);

  /*
   * ==========================================================
   * AG GRID COLUMN DEFINITION
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * DEFAULT AG GRID COLUMN DEFINITION
   * ==========================================================
   */

  const defaultColDef =
    useMemo(
      () => ({
        minWidth: 100,
        resizable: true,
        sortable: true,
        filter: true,
        /*
         * Let columns share available width.
         */
        flex: 1,
      }),
      []
    );

  /*
   * ==========================================================
   * TAB CHANGE
   * ==========================================================
   */

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  /*
   * ==========================================================
   * EXECUTE BUTTON
   * ==========================================================
   */

  const handleExecute =
    () => {
      /*
       * Save the query into the URL.
       *
       * Your existing custom hook should
       * handle navigation/update.
       */

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

      /*
       * Result tab.
       */
      setTabValue(4);
    };

  /*
   * ==========================================================
   * COLUMN CHANGE
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * SELECT ALL
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * SELECTED COLUMN COUNT
   * ==========================================================
   */

  const selectedColumnCount = reportColumns.filter((column) => visibleColumns[column.field]).length;

  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

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
      {/* ====================================================
          HEADER
      ==================================================== */}

      <Stack
        direction="row"
        spacing={1}
        // alignItems="center"
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
          disabled={reportLoading}
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

      {/* ====================================================
          TABS
      ==================================================== */}

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
        <Tab label="استعلام 1" {...a11yProps(0)} />
        <Tab label="استعلام 2" {...a11yProps(1)} />
        <Tab label={`الأعمدة (${selectedColumnCount})`} {...a11yProps(2)} />
        <Tab label="ترتيب حسب" {...a11yProps(3)} />
        <Tab label="النتيجة" {...a11yProps(4)} />
      </Tabs>

      {/* ====================================================
          QUERY 1
      ==================================================== */}

      <CustomTabPanel
        value={tabValue}
        index={0}
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

      {/* ====================================================
          QUERY 2
      ==================================================== */}

      <CustomTabPanel
        value={tabValue}
        index={1}
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
          {fieldsLoading ? (
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
              validator={defaultValidator}
              operators={arabicOperators}
              showNotToggle
            />
          )}
        </Box>
      </CustomTabPanel>

      {/* ====================================================
          COLUMNS
      ==================================================== */}

      <CustomTabPanel
        value={tabValue}
        index={2}
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

          {/* SELECT ALL */}

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

          {/* COLUMNS */}

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

      {/* ====================================================
          SORT
      ==================================================== */}

      <CustomTabPanel
        value={tabValue}
        index={3}
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

          {/*
           * Example future state:
           *
           * setSort([
           *   {
           *     field: 'price',
           *     direction: 'desc'
           *   }
           * ])
           *
           * This value is already passed
           * to executeReportApi().
           */}
        </Box>
      </CustomTabPanel>

      {/* ====================================================
          RESULT
      ==================================================== */}

      <CustomTabPanel
        value={tabValue}
        index={4}
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
          {/* API ERROR */}

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

          {/* LOADING */}

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

          {/* GRID */}

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

