import { notFound } from 'next/navigation';
import SalesInvoicePrint from '@/components/print/SalesInvoicePrint';

export default async function Page({ params }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }
  return <SalesInvoicePrint id={id} />;
}
