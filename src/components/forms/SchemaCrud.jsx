'use client';

import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { SpeedDial, SpeedDialAction, SpeedDialIcon } from '@mui/material';
import FormFields from './FormFields';
import useSWR from 'swr';
import { useEffect, useState } from 'react';

const allActions = [
  { icon: <AddIcon />, name: 'جديد' },
  { icon: <SaveIcon />, name: 'حفظ' },
  { icon: <DeleteIcon />, name: 'حذف' },
];

const isAddNewActions = [
  { icon: <SaveIcon />, name: 'حفظ' },
  { icon: <DeleteIcon />, name: 'حذف' },
];

// function useFormFields(schemaName, entityId) {
// const [formFields, setFormFields] = useState({});
// useEffect(() => {
//   async function fetchFormFields() {
//     const res = await fetch(`/api/schemacrud/${schemaName}${entityId ? `/${entityId}` : ''}`, {
//       credentials: 'include',
//     });
//     const formFields = await res.json();
//     setFormFields(formFields);
//   }
//   fetchFormFields()
// }, [schemaName, entityId])
// return formFields;
// }

const fetcher = (url) => fetch(url, {
  credentials: 'include',
}).then((res) => res.json());

export default function SchemaCrud({ schemaName, entityId }) {
  const isAddNew = !entityId;
  const { data: formFieldsAndValues, isValidating } = useSWR(
    `/api/schemacrud/${schemaName}${entityId ? `/${entityId}` : ''}`,
    fetcher,
  );
  const [formValues, setFormValues] = useState({});
  const [isValid, setIsValid] = useState({});

  useEffect(() => {
    setFormValues(formFieldsAndValues?.values)
  }, [formFieldsAndValues?.values])

  return <>
    {!isValidating && formFieldsAndValues && formValues &&
      <FormFields
        formFields={formFieldsAndValues.fields}
        formValues={formValues}
        setFormValues={setFormValues}
        isValid={isValid}
        setIsValid={setIsValid}
      />}
    <SpeedDial
      ariaLabel="SpeedDial basic example"
      sx={{ position: 'absolute', bottom: 10, right: 16 }}
      icon={<SpeedDialIcon />}
    >
      {(isAddNew ? isAddNewActions : allActions).map((action) => (
        <SpeedDialAction
          key={action.name}
          icon={action.icon}
          slotProps={{
            tooltip: {
              title: action.name,
            },
          }}
        />
      ))}
    </SpeedDial>
  </>
}