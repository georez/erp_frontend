import getComponentForUrl from "@/utils/urlToComponentMap";
import { notFound } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default async function Page({ params, searchParams }) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const urlToResolve = `/dashboard/${slug.join('/')}`;

  const Component = getComponentForUrl(urlToResolve);
  if (!Component) {
    notFound();
  }

  return <Component key={uuidv4()} url={urlToResolve} {...resolvedSearchParams} />;
}

export async function generateMetadata({ searchParams }) {
  const { formTitle } = await searchParams;
  
  return {
    title: formTitle,
  };
}