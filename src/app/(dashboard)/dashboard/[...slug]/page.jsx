import renderComponentForUrl, { hasComponentForUrl } from "@/utils/urlToComponentMap";
import { notFound } from "next/navigation";

// The form's window id on its own page (the dashboard gives each window its own): its fields' ids start with it
const PAGE_FORM_ID = 'page';

export default async function Page({ params, searchParams }) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const urlToResolve = `/dashboard/${slug.join('/')}`;

  if (!hasComponentForUrl(urlToResolve)) {
    notFound();
  }

  // The form fills the screen, the way a dashboard window gives it a fixed size: components that size
  // themselves to their container (the report's grid has height: 100%) would otherwise collapse to nothing
  return (
    <div style={{ height: '100dvh', overflow: 'auto' }}>
      {/* The URL's params first, so none of them replaces the page's url, form id or title */}
      {renderComponentForUrl(urlToResolve, {
        ...resolvedSearchParams,
        url: urlToResolve,
        formId: PAGE_FORM_ID,
        // Not "undefined" in the URLs the form makes from it
        formTitle: resolvedSearchParams.formTitle ?? '',
      })}
    </div>
  );
}

export async function generateMetadata({ searchParams }) {
  const { formTitle } = await searchParams;

  return {
    title: formTitle,
  };
}