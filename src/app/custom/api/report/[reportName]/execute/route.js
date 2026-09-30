import { transformFields } from "@/utils/reportutils";
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
    `http://localhost:4000/api/report/${encodeURIComponent(reportName)}/searchparams2`,
    {
      headers: {
        Cookie: cookieHeader,
      },
      cache: 'no-store'
    }
  );

  const fields = await searchParams.json();
  const transformedFields = transformFields(fields);
  const diagnostics = formatQuery(query, { format: 'diagnostics', fields: transformedFields });
  
  if (!diagnostics?.query?.valid) {
    return Response.json({
      success: false,
      message: 'Invalid report query',
      diagnostics: diagnostics?.diagnostics ?? [],
    }, { status: 400 });
  }

  const {sql, params: sqlParams} = formatQuery(query, { format: 'parameterized_named', fields: transformedFields });

  const response = await fetch(
    `http://localhost:4000/api/report/${encodeURIComponent(reportName)}/execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      cache: 'no-store',
      body: JSON.stringify({sql, params: sqlParams})
    }
  );

  const reportBody = await response.json();

  console.log('reportBody:', reportBody);
  
  return Response.json(reportBody);
}