'use client';

import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { Alert, Container, SpeedDial, SpeedDialAction, SpeedDialIcon, Stack, Typography } from '@mui/material';
import FormFields from './FormFields';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { validateFormField } from '@/utils/formValidation';
import { useDebouncedCallback } from 'use-debounce';
import { useUpdateMultipleSearchParams, useUpdateOpenForms, useUpdateSearchParam } from '@/utils/useUpdateSearchParams';
import { CSRF_HEADER_NAME } from '@/constants';
import { getNewCsrfToken } from '@/utils/csrfClientUtils';
import { useRouter, useSearchParams } from 'next/navigation';

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

export default function SchemaCrud({ schemaName, entityId, formTitle, formId }) {
  // const urlSearchParams = useSearchParams();
  // const router = useRouter();
  // const openForms = JSON.parse(urlSearchParams.get('openForms'));
  const updateOpenFormUrl = useUpdateOpenForms(formId);

  const handleFilterChange = useUpdateSearchParam();
  const isAddNew = !entityId;
  const { data: formFieldsAndValues, isValidating } = useSWR(
    `/api/schemacrud/${schemaName}${entityId ? `/${entityId}` : ''}`,
    fetcher,
  );
  const [formValues, setFormValues] = useState({});
  const [isValid, setIsValid] = useState({});
  const [tryToSubmit, setTryToSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    setFormValues(formFieldsAndValues?.values)
  }, [formFieldsAndValues?.values])

  const [csrfToken, setCsrfToken] = useState(null);
  useEffect(() => {
    getNewCsrfToken(setCsrfToken);
  }, []);

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

  const debouncedSaveNew = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    setErrorMessage(null);
    if (validateFields()) {
      const res = await fetch(`/api/schemacrud/${schemaName}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: csrfToken
        },
        body: JSON.stringify(formValues)
      });
      if (!res.ok) {
        const { errorMessage } = await res.json();
        setErrorMessage(errorMessage || res.statusText);
        return;
      }
      const { id: objectNewId } = await res.json();
      updateOpenFormUrl(
        `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
        }&formTitle=${encodeURIComponent(formTitle)
        }&entityId=${encodeURIComponent(objectNewId)
        }`
      );

    }
  }, 300);

  const debouncedAddNew = useDebouncedCallback(() => {
    updateOpenFormUrl(`/dashboard/form?schemaName=${encodeURIComponent(schemaName)
      }&formTitle=${encodeURIComponent(formTitle)}`);
  }, 300);

  const debouncedSaveExisting = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    setErrorMessage(null);
    if (validateFields()) {
      const res = await fetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: csrfToken
        },
        body: JSON.stringify(formValues)
      });
      if (!res.ok) {
        const { errorMessage } = await res.json();
        setErrorMessage(errorMessage || res.statusText);
        return;
      }
      const { id: objectNewId } = await res.json();
      updateOpenFormUrl(
        `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
        }&formTitle=${encodeURIComponent(formTitle)
        }&entityId=${encodeURIComponent(objectNewId)
        }`, true);
    }
  }, 300);

  const debouncedDeleteExisting = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    if (validateFields()) {
      const res = await fetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "DELETE",
        headers: {
          [CSRF_HEADER_NAME]: csrfToken
        }
      });
      if (!res.ok) {
        const { errorMessage } = await res.json();
        setErrorMessage(errorMessage || res.statusText);
        return;
      }
      updateOpenFormUrl(`/dashboard/form?schemaName=${encodeURIComponent(schemaName)
        }&formTitle=${encodeURIComponent(formTitle)}`);
    }
  }, 300);

  return <Container maxWidth="sm">
    {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
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
      ariaLabel="Page SpeedDial"
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
        :
        [<SpeedDialAction
          key="add"
          icon={<AddIcon />}
          slotProps={{
            tooltip: {
              title: 'جديد',
            },
          }}
          onClick={debouncedAddNew} />,
        <SpeedDialAction
          key="save"
          icon={<SaveIcon />}
          slotProps={{
            tooltip: {
              title: 'حفظ',
            },
          }}
          onClick={debouncedSaveExisting}
        />,
        <SpeedDialAction
          key="delete"
          icon={<DeleteIcon />}
          slotProps={{
            tooltip: {
              title: 'حذف',
            },
          }}
          onClick={debouncedDeleteExisting} />]
      )}
    </SpeedDial>
  </Container>
}