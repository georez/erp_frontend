'use client';

import DraggableForm from "@/components/dashboard/DraggableForm";
import DrawerForm from "@/components/dashboard/DrawerForm";
import renderComponentForUrl from "@/utils/urlToComponentMap";
import { useSearchParams } from "next/navigation";
import { readOpenForms } from "@/utils/useUpdateSearchParams";

// A new window's size: room for a form with lines or a report's grid, and still fits a 1366×768 laptop screen with
// a few windows cascaded (each opens 30px further down and across).
const WINDOW_WIDTH = 900;
const WINDOW_HEIGHT = 600;

export default function DashboardClient() {
  const urlSearchParams = useSearchParams();
  const openForms = readOpenForms(urlSearchParams) ?? [];
  const draggableForms = openForms.map(({ formId, url, formTitle }, index) => {

    const resolvedSearchParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    const content = renderComponentForUrl(url, { formId, url, formTitle, ...resolvedSearchParams });

    return <DraggableForm
      key={formId}
      x={20 + index * 30}
      y={60 + index * 30}
      width={WINDOW_WIDTH}
      height={WINDOW_HEIGHT}
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
