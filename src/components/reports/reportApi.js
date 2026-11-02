import { CONNECTION_ERROR_MESSAGE } from '@/utils/sendOrShowError';
import { readErrorMessage } from '@/utils/fetchJson';

/**
 * Loads the report's metadata from the backend: its params (search params 1, shaped like CRUD form fields), its
 * output columns, which serve the query builder (the filterable ones), the sort tab (the sortable ones) and the result
 * grid (all but the internal ones, which only the links, indents and totals read), and whether the report has a fixed
 * order (then the sort tab offers no columns).
 *
 * @returns {Promise<{title: string, params: Array<object>, columns: Array<{name: string, label: string,
 *   inputType?: string, valueEditorType?: string, filterable: boolean, sortable: boolean, indentBy?: string,
 *   hidden: boolean, internal: boolean, format?: string, link?: {schemaName?: string, document?: string, documentColumn?: string,
 *   idColumn: string, formTitle?: string}}>, fixedOrder: boolean,
 *   totals: {label: string, labelColumn: string, columns: string[], skipRowsWhere?: string}|null}>}
 * @throws {Error} with fromBackend set when the backend refused (its reason, in Arabic: a report that doesn't
 *   exist...), for the screen to show
 */
export async function fetchReportMetadata(reportName) {
  const response = await fetch(`/api/report/${encodeURIComponent(reportName)}/metadata`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const error = new Error(await readErrorMessage(response));
    error.fromBackend = true;
    throw error;
  }
  return response.json();
}

/**
 * Runs the report through the Next.js route /custom/api/report/{reportName}/execute. That route checks the query
 * against the report's columns, turns it into parameterized SQL, signs the request and forwards it to the backend,
 * which runs it as a read-only database role.
 *
 * The rows come sorted by `sort` (the backend refuses a sort on a report with a fixed order, which comes in its own
 * order). `columns` is sent for future use; the route and backend currently ignore it and return every column.
 *
 * @param {object} args
 * @param {Function} args.csrfFetch  sends the CSRF token the proxy requires for the POST (from AuthContext)
 * @param {object} args.query  react-querybuilder query (search params 2)
 * @param {object} args.reportParams  the report's param values by name (search params 1)
 * @param {string[]} args.columns  fields of the currently visible columns
 * @param {Array<{column: string, direction: 'asc'|'desc'}>} args.sort  most important column first
 * @returns {Promise<Array<object>>} every result row, one object per row keyed by column field
 * @throws {Error} with the route's error message when the request fails, or CONNECTION_ERROR_MESSAGE when the server
 *   can't be reached (network failure, or no CSRF token could be obtained)
 */
export async function executeReport({ csrfFetch, reportName, query, reportParams, columns, sort }) {
  let response;
  try {
    response = await csrfFetch(`/custom/api/report/${encodeURIComponent(reportName)}/execute`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, reportParams, columns, sort }),
    });
  } catch (error) {
    // The same message the forms show (sendOrShowError), instead of the technical one
    console.error('Report request failed:', error);
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await executeErrorMessage(response));
  }
  const data = await response.json();
  if (!Array.isArray(data?.rows)) {
    throw new Error('Invalid execute API response');
  }
  return data.rows;
}

/** The route's message for a failed run, else one naming the status. */
async function executeErrorMessage(response) {
  try {
    const errorData = await response.json();
    if (errorData?.message) {
      return errorData.message;
    }
  } catch {
    // Not JSON: the status-based message
  }
  return `Report execution failed (${response.status})`;
}
