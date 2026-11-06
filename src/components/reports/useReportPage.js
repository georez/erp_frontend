'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { paramOrderProblem, parseJsonObject, selectReportParams, validateReportParams } from '@/utils/reportutils';
import { executeReport, fetchReportMetadata } from './reportApi';

/** All of a report's rows: a page of its own has no query builder. */
const ALL_ROWS = { combinator: 'and', rules: [] };

/**
 * The URL of a report page (e.g. "trial-balance") that runs at once with the given params: what Run writes, and what
 * a link from another page opens (the trial balance's account → its statement). A new requestTime, so the same params
 * run again.
 *
 * @param {string} page  the page's path under /dashboard (urlToComponentMap)
 * @param {string} formTitle
 * @param {object} params  the report's param values by name
 */
export function reportPageUrl(page, formTitle, params) {
  return `/dashboard/${page}?formTitle=${encodeURIComponent(formTitle)}`
    + `&params=${encodeURIComponent(JSON.stringify(params))}&execute=true&requestTime=${Date.now()}`;
}

/** The current month up to today, in the browser's time zone: the period a new report page starts with. */
export function monthToDate() {
  const today = new Date();
  const twoDigits = (number) => String(number).padStart(2, '0');
  const yearMonth = `${today.getFullYear()}-${twoDigits(today.getMonth() + 1)}`;
  return { p_from_date: `${yearMonth}-01`, p_to_date: `${yearMonth}-${twoDigits(today.getDate())}` };
}

/** Loads a report's metadata once: its params' form fields, its totals, its columns' links. */
function useReportMetadata(reportName) {
  const [metadata, setMetadata] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchReportMetadata(reportName)
      .then((loaded) => {
        if (!cancelled) {
          setMetadata(loaded);
        }
      })
      .catch((error) => {
        console.error('Report metadata error:', error);
        if (!cancelled) {
          setLoadError(error.fromBackend ? error.message : 'تعذر تحميل التقرير.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportName]);
  return { metadata, loadError };
}

/**
 * A report shown on a page of its own (the trial balance, the account statement): its params in a form, Run, and the
 * rows. Like the report screen, the page's state is in its dashboard URL: `params` (JSON-encoded), `execute` ("true"
 * once run) and `requestTime` (new on every Run), so a link reopens the same report and runs it. The rows come from
 * the report route, like any report's.
 *
 * @param {object} options
 * @param {string} options.reportName  the backend report (resources/reports)
 * @param {string} options.page  the page's path under /dashboard
 * @param {string} options.formId  the dashboard window, for its URL
 * @param {string} options.formTitle
 * @param {string} [options.params]  from the URL: the params the page was opened or last run with
 * @param {string} [options.execute]  from the URL
 * @param {string} [options.requestTime]  from the URL
 * @param {object} options.initialParams  the form's values when the URL has none
 */
export function useReportPage({ reportName, page, formId, formTitle, params, execute, requestTime, initialParams }) {
  const updateOpenFormsUrl = useUpdateOpenForms(formId);
  const { csrfFetch } = useContext(AuthContext);
  const { metadata, loadError } = useReportMetadata(reportName);
  const paramFields = useMemo(() => metadata?.params ?? [], [metadata]);

  // The params being edited: from the URL, or the initial ones; read again when the URL's change (Back, Forward), so
  // the form shows what the rows are of. Set during render, so the form never shows the old ones first:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [paramValues, setParamValues] = useState(() => parseJsonObject(params, initialParams));
  const [paramsReadFrom, setParamsReadFrom] = useState(params);
  if (params !== paramsReadFrom) {
    setParamsReadFrom(params);
    setParamValues(parseJsonObject(params, initialParams));
  }
  const [paramValidity, setParamValidity] = useState({});
  const [showParamErrors, setShowParamErrors] = useState(false);

  const [rows, setRows] = useState([]);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState('');

  // Runs when the URL asks for it, and again on every Run (requestTime changes), once the metadata is in. A newer run
  // discards the result of an older one still in flight.
  const shouldExecute = execute === 'true';
  useEffect(() => {
    if (!shouldExecute || !metadata) {
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setRunError('');
      try {
        const result = await executeReport({
          csrfFetch, reportName, query: ALL_ROWS, reportParams: parseJsonObject(params, {}), columns: [], sort: [],
        });
        if (cancelled) {
          return;
        }
        setRows(result);
        setHasRun(true);
      } catch (error) {
        console.error('Report page error:', error);
        if (!cancelled) {
          setRows([]);
          setRunError(error?.message ?? 'حدث خطأ أثناء تنفيذ التقرير');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [shouldExecute, requestTime, reportName, params, metadata, csrfFetch]);

  /** Run: checks the params (the fields show what's wrong), then writes them into the URL, which runs them. */
  const handleRun = () => {
    const validity = validateReportParams(paramFields, paramValues);
    setParamValidity(validity);
    if (!Object.values(validity).every(Boolean)) {
      setShowParamErrors(true);
      setRunError(paramOrderProblem(paramFields, paramValues) ?? '');
      return;
    }
    setRunError('');
    updateOpenFormsUrl(reportPageUrl(page, formTitle, selectReportParams(paramFields, paramValues)));
  };

  return {
    metadata,
    loadError,
    paramForm: { paramFields, paramValues, setParamValues, paramValidity, setParamValidity, showParamErrors },
    rows,
    hasRun,
    loading,
    runError,
    clearRunError: () => setRunError(''),
    handleRun,
  };
}
