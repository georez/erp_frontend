'use client';

import DraggableForm from "@/components/dashboard/DraggableForm";
import DrawerForm from "@/components/dashboard/DrawerForm";
import getComponentForUrl from "@/utils/urlToComponentMap";
import { useSearchParams } from "next/navigation";

export default function DashboardClient() {
  const urlSearchParams = useSearchParams();
  const openForms = JSON.parse(urlSearchParams.get('openForms') || '[]');
  const draggableForms = openForms.map(({ formId, url, formTitle }, index) => {

    const Component = getComponentForUrl(url);
    const resolvedSearchParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]));

    return <DraggableForm
      key={formId}
      x={20 + index * 30}
      y={60 + index * 30}
      width={320}
      height={200}
      formId={formId}
      url={url}
      formTitle={formTitle}
    >
      {Component ? <Component url={url} formTitle={formTitle} {...resolvedSearchParams} /> : <div>Not found 404</div>}
    </DraggableForm>
  });
  return (
    <DrawerForm>
      {draggableForms}
    </DrawerForm>
  );
}
