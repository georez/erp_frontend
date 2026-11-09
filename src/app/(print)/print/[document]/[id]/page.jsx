import { notFound } from 'next/navigation';
import { PRINT_PAGES } from '@/components/print/printPages';

export default async function Page({ params }) {
  const { document, id } = await params;
  const Printout = Object.hasOwn(PRINT_PAGES, document) ? PRINT_PAGES[document] : null;
  if (!Printout || !/^\d+$/.test(id)) {
    notFound();
  }
  return <Printout id={id} />;
}
