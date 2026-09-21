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
import { useUpdateMultipleSearchParams, useUpdateSearchParam } from '@/utils/useUpdateSearchParams';
import { CSRF_HEADER_NAME } from '@/constants';
import { getNewCsrfToken } from '@/utils/csrfClientUtils';
import { useSearchParams } from 'next/navigation';

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
  const urlSearchParams = useSearchParams();
  const openForms = JSON.parse(urlSearchParams.get('openForms') || '[]');
  const handleFilterChange = useUpdateSearchParam();
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
    if (validateFields()) {
      const res = await fetch(`/api/schemacrud/${schemaName}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: csrfToken
        },
        body: JSON.stringify(formValues)
      });
      const { id: objectNewId } = await res.json();
      const newOpenForms = openForms.map(openForm =>
        openForm.formId !== formId ?
          openForm :
          ({
            ...openForm, url: `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
              }&formTitle=${encodeURIComponent(formTitle)
              }&entityId=${encodeURIComponent(objectNewId)
              }`
          })
      );
      handleFilterChange('openForms', JSON.stringify(newOpenForms));
    }
  }, 300);

  const debouncedAddNew = useDebouncedCallback(() => {
    const newOpenForms = openForms.map(openForm =>
      openForm.formId !== formId ?
        openForm :
        ({
          ...openForm, url: `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
            }&formTitle=${encodeURIComponent(formTitle)}`
        })
    );
    handleFilterChange('openForms', JSON.stringify(newOpenForms));
  }, 300);

  const debouncedSaveExisting = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    if (validateFields()) {
      const res = await fetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: csrfToken
        },
        body: JSON.stringify(formValues)
      });
      const { id: objectNewId } = await res.json();
      const newOpenForms = openForms.map(openForm =>
        openForm.formId !== formId ?
          openForm :
          ({
            ...openForm, url: `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
              }&formTitle=${encodeURIComponent(formTitle)
              }&entityId=${encodeURIComponent(objectNewId)
              }`
          })
      );
      handleFilterChange('openForms', JSON.stringify(newOpenForms));
    }
  }, 300);

  const debouncedDeleteExisting = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    if (validateFields()) {
      await fetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "DELETE",
        headers: {
          [CSRF_HEADER_NAME]: csrfToken
        }
      });
      const newOpenForms = openForms.map(openForm =>
        openForm.formId !== formId ?
          openForm :
          ({
            ...openForm, url: `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
              }&formTitle=${encodeURIComponent(formTitle)}`
          })
      );
      handleFilterChange('openForms', JSON.stringify(newOpenForms));
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