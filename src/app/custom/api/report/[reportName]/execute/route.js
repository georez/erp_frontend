import { createHmac } from "node:crypto";
import { formatQueryProblems, transformFields, validateReportQuery } from "@/utils/reportutils";
import { cookies } from "next/headers";
import { formatQuery } from "react-querybuilder";

export async function POST(request, { params }) {

  const { reportName } = await params;
  const { query, sort } = await request.json();
  const cookieStore = await cookies();

  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  const searchParams = await fetch(
    `http://127.0.0.1:4000/api/report/${encodeURIComponent(reportName)}/searchparams2`,
    {
      headers: {
        Cookie: cookieHeader,
      },
      cache: 'no-store'
    }
  );

  if (!searchParams.ok) {
    return backendError(searchParams);
  }

  const fields = await searchParams.json();
  const transformedFields = transformFields(fields);

  // Strict allow-list check of the whole query before any SQL is generated: formatQuery copies field
  // names, operators and combinators into the SQL as they are, and this route's signature makes the
  // backend trust the result (see validateReportQuery)
  const problems = validateReportQuery(query, transformedFields);
  if (problems.length > 0) {
    return Response.json({
      success: false,
      message: formatQueryProblems(problems),
      problems,
    }, { status: 400 });
  }

  const {sql, params: sqlParams} = formatQuery(query, { format: 'parameterized_named', fields: transformedFields });

  // Sign the exact body so the backend only runs SQL produced by this route
  const signingSecret = process.env.REPORT_SIGNING_SECRET;
  if (!signingSecret) {
    return Response.json({ success: false, message: 'Report signing is not configured' }, { status: 500 });
  }
  const body = JSON.stringify({sql, params: sqlParams});
  const signature = createHmac('sha256', signingSecret)
    .update(`${reportName}\n${body}`)
    .digest('hex');

  const response = await fetch(
    `http://127.0.0.1:4000/internal/report/${encodeURIComponent(reportName)}/execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Report-Signature': signature,
        Cookie: cookieHeader,
      },
      cache: 'no-store',
      body
    }
  );

  if (!response.ok) {
    return backendError(response);
  }

  const reportBody = await response.json();

  return Response.json(reportBody);
}

// Passes the backend's status through, with its errorMessage as `message` (what Report.jsx displays)
async function backendError(response) {
  const errorBody = await response.json().catch(() => null);
  return Response.json({
    success: false,
    message: errorBody?.errorMessage ?? `Report request failed (${response.status})`,
  }, { status: response.status });
}