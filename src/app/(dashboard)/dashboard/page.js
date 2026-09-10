'use client';

import DraggableForm from "@/components/DraggableForm";
import DrawerForm from "@/components/DrawerForm";
import { useSearchParams } from "next/navigation";

export default function Page() {

  const urlSearchParams = useSearchParams();
  const openForms = JSON.parse(urlSearchParams.get('openForms') || '[]');
  const draggableForms = openForms.map(({ formId, url }, index) => (
    <DraggableForm
      key={formId}
      x={20 + index * 30}
      y={60 + index * 30}
      width={320}
      height={200}
      formId={formId}
      url={url}
    >
      <div>This is a test for form {formId}</div>
    </DraggableForm>
  ));
  return (
    <DrawerForm>
      {draggableForms}
    </DrawerForm>
  );
}
