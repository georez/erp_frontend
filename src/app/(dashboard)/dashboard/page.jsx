'use client';

import DraggableForm from "@/components/DraggableForm";
import DrawerForm from "@/components/DrawerForm";
import getComponentForUrl from "@/utils/urlToComponentMap";
import { useSearchParams } from "next/navigation";

export default function Page() {
  const urlSearchParams = useSearchParams();
  const openForms = JSON.parse(urlSearchParams.get('openForms') || '[]');
  const draggableForms = openForms.map(({ formId, url }, index) => {

    const Component = getComponentForUrl(url);
    const resolvedParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]));

    return <DraggableForm
      key={formId}
      x={20 + index * 30}
      y={60 + index * 30}
      width={320}
      height={200}
      formId={formId}
      url={url}
    >
      {Component ? <Component url={url} {...resolvedParams} /> : <div>Not found 404</div>}
    </DraggableForm>
  }
  );
  return (
    <DrawerForm>
      {draggableForms}
    </DrawerForm>
  );
}
