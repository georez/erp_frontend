'use client';

import DraggableForm from "@/components/dashboard/DraggableForm";
import DrawerForm from "@/components/dashboard/DrawerForm";
import renderComponentForUrl from "@/utils/urlToComponentMap";
import { useSearchParams } from "next/navigation";
import LZString from 'lz-string';

export default function DashboardClient() {
  const urlSearchParams = useSearchParams();
  const openForms = JSON.parse(urlSearchParams.get('openForms') ?
    LZString.decompressFromEncodedURIComponent(urlSearchParams.get('openForms')) :
    '[]');
  const draggableForms = openForms.map(({ formId, url, formTitle }, index) => {

    const resolvedSearchParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    const content = renderComponentForUrl(url, { formId, url, formTitle, ...resolvedSearchParams });

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
      {content ?? <div>Not found 404</div>}
    </DraggableForm>
  });
  return (
    <DrawerForm backgroundColor={'#008cff46'}>
      {draggableForms}
    </DrawerForm>
  );
}
