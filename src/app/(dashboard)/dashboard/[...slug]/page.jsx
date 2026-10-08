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

  return renderComponentForUrl(urlToResolve, {
    url: urlToResolve,
    formTitle: resolvedSearchParams.formTitle,
    ...resolvedSearchParams,
  });
}

export async function generateMetadata({ searchParams }) {
  const { formTitle } = await searchParams;

  return {
    title: formTitle,
  };
}