'use client';

import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { Container, SpeedDial, SpeedDialAction, SpeedDialIcon, Stack, Typography } from '@mui/material';
import FormFields from './FormFields';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { validateFormField } from '@/utils/formValidation';
import { useDebouncedCallback } from 'use-debounce';

const allActions = [
  { icon: <AddIcon />, name: 'جديد' },
  { icon: <SaveIcon />, name: 'حفظ' },
  { icon: <DeleteIcon />, name: 'حذف' },
];

const isAddNewActions = [
  { icon: <SaveIcon />, name: 'حفظ' },
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

export default function SchemaCrud({ schemaName, entityId, formTitle }) {
  const isAddNew = !entityId;
  const { data: formFieldsAndValues, isValidating } = useSWR(
    `/api/schemacrud/${schemaName}${entityId ? `/${entityId}` : ''}`,
    fetcher,
  );
  const [formValues, setFormValues] = useState({});
  const [isValid, setIsValid] = useState({});
  const [tryToSubmit, setTryToSubmit] = useState(false);

  useEffect(() => {
    setFormValues(formFieldsAndValues?.values)
  }, [formFieldsAndValues?.values])

  const validateFields = () => {
    const newIsValid = formFieldsAndValues.fields.reduce((acc, {
      fieldName, validationType, validation, required, disabled
    }) => ({
      ...acc,
      [fieldName]: !!disabled || validateFormField(
        validationType, required, validation, formValues[fieldName]
      )
    }), {});
    setIsValid(newIsValid);
    const areAllFieldsValid = Object.entries(newIsValid).every(([k, v]) => v);
    return areAllFieldsValid;
  };

  const debouncedSaveNew = useDebouncedCallback(() => {
    setTryToSubmit(true);
    if (validateFields()) {
      console.log('submit:', formValues);
    }
  }, 300);

  return <Container maxWidth="sm">
    <Stack spacing={2} sx={{ p: 1 }}>
      <Typography variant="h7" component="div">{formTitle}</Typography>
      {!isValidating && formFieldsAndValues && formValues &&
        <FormFields
          formFields={formFieldsAndValues.fields}
          formValues={formValues}
          setFormValues={setFormValues}
          isValid={isValid}
          setIsValid={setIsValid}
          tryToSubmit={tryToSubmit}
        />}
    </Stack>
    <SpeedDial
      ariaLabel="SpeedDial basic example"
      sx={{ position: 'absolute', bottom: 10, right: 16 }}
      icon={<SpeedDialIcon />}
    >
      {(isAddNew ?
        <SpeedDialAction
          icon={<SaveIcon />}
          slotProps={{
            tooltip: {
              title: 'حفظ',
            },
          }}
          onClick={debouncedSaveNew}
        />
        : <>
          <SpeedDialAction
            icon={<AddIcon />}
            slotProps={{
              tooltip: {
                title: 'جديد',
              },
            }} />
          <SpeedDialAction
            icon={<SaveIcon />}
            slotProps={{
              tooltip: {
                title: 'حفظ',
              },
            }}
            onClick={() => {
              validateFields();
            }}
          />
          <SpeedDialAction
            icon={<DeleteIcon />}
            slotProps={{
              tooltip: {
                title: 'حذف',
              },
            }} />
        </>)}
    </SpeedDial>
  </Container>
}