import getComponentForUrl from "@/utils/urlToComponentMap";
import { notFound } from "next/navigation";

export default async function Page({ params, searchParams }) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const urlToResolve = `/dashboard/${slug.join('/')}`;

  const Component = getComponentForUrl(urlToResolve);
  if (!Component) {
    notFound();
  }

  return <Component url={urlToResolve} {...resolvedSearchParams} />;
}