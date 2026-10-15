'use client';

import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { Alert, Container, SpeedDial, SpeedDialAction, SpeedDialIcon, Stack, Typography } from '@mui/material';
import FormFields from './FormFields';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { validateFormField } from '@/utils/formValidation';
import { useDebouncedCallback } from 'use-debounce';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

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

export default function SchemaCrud({ schemaName, entityId, formTitle, formId }) {
  const updateOpenFormUrl = useUpdateOpenForms(formId);

  const isAddNew = !entityId;
  const { data: formFieldsAndValues, error: loadError, isValidating } = useSWR(
    `/api/schemacrud/${schemaName}${entityId ? `/${entityId}` : ''}`,
    fetchJson,
  );
  const loadedValues = formFieldsAndValues?.values;
  const [formValues, setFormValues] = useState(loadedValues);
  const [isValid, setIsValid] = useState({});
  const [tryToSubmit, setTryToSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Reset the form whenever newly loaded values arrive (another entity, or a reload that changed them).
  // Done during render rather than in an effect, so React doesn't render once with the stale values first:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [valuesLoadedFrom, setValuesLoadedFrom] = useState(loadedValues);
  if (loadedValues !== valuesLoadedFrom) {
    setValuesLoadedFrom(loadedValues);
    setFormValues(loadedValues);
  }

  // Needed for every save and delete; shared by the dashboard (AuthProvider)
  const { csrfFetch } = useContext(AuthContext);

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
      const res = await sendOrShowError(() => csrfFetch(`/api/schemacrud/${schemaName}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formValues)
      }), setErrorMessage);
      if (!res) {
        return;
      }
      if (!res.ok) {
        setErrorMessage(await readErrorMessage(res));
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
      const res = await sendOrShowError(() => csrfFetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formValues)
      }), setErrorMessage);
      if (!res) {
        return;
      }
      if (!res.ok) {
        setErrorMessage(await readErrorMessage(res));
        return;
      }
      const { id: objectNewId } = await res.json();
      updateOpenFormUrl(
        `/dashboard/form?schemaName=${encodeURIComponent(schemaName)
        }&formTitle=${encodeURIComponent(formTitle)
        }&entityId=${encodeURIComponent(objectNewId)
        }`);
    }
  }, 300);

  const debouncedDeleteExisting = useDebouncedCallback(async () => {
    setTryToSubmit(true);
    setErrorMessage(null);
    if (validateFields()) {
      const res = await sendOrShowError(() => csrfFetch(`/api/schemacrud/${schemaName}/${entityId}`, {
        method: "DELETE",
      }), setErrorMessage);
      if (!res) {
        return;
      }
      if (!res.ok) {
        setErrorMessage(await readErrorMessage(res));
        return;
      }
      updateOpenFormUrl(`/dashboard/form?schemaName=${encodeURIComponent(schemaName)
        }&formTitle=${encodeURIComponent(formTitle)}`);
    }
  }, 300);

  return <Container maxWidth="sm">
    {loadError && <Alert severity="error">{loadError.message}</Alert>}
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