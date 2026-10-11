import renderComponentForUrl, { hasComponentForUrl } from "@/utils/urlToComponentMap";
import { notFound } from "next/navigation";
// import { v4 as uuidv4 } from "uuid";

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
      {renderComponentForUrl(urlToResolve, {
        url: urlToResolve,
        formTitle: resolvedSearchParams.formTitle,
        ...resolvedSearchParams,
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