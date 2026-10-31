'use client';

import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { Alert, Container, SpeedDial, SpeedDialAction, SpeedDialIcon, Stack, Typography } from '@mui/material';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { validateFormField } from '@/utils/formValidation';
import { sendOrShowError } from '@/utils/sendOrShowError';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import FormFields from './FormFields';

// A click on an action runs it once, even if clicked twice quickly
const CLICK_DEBOUNCE_MS = 300;

/** The window's URL for a record of the table: a new one (no id), or the one with that id. */
const formUrl = (schemaName, formTitle, entityId) => {
  const idPart = entityId == null ? '' : `&entityId=${encodeURIComponent(entityId)}`;
  return `/dashboard/form?schemaName=${encodeURIComponent(schemaName)}&formTitle=${encodeURIComponent(formTitle)}${idPart}`;
};

/** Each field's validity, by field name, as the backend checks it. A disabled field is always valid. */
function validateAll(fields, values) {
  return Object.fromEntries(fields.map(({ fieldName, validationType, validation, required, disabled }) => [
    fieldName,
    !!disabled || validateFormField(validationType, required, validation, values[fieldName]),
  ]));
}

/**
 * The generic form of a table's record (customers, products, accounts...): its fields come from the backend's
 * metadata (/api/schemacrud/{schemaName}), with the record's values when it has an id. Save creates or updates the
 * record, new opens an empty form, delete removes it; the window's URL then points to the record (or to a new one).
 */
export default function SchemaCrud({ schemaName, entityId, formTitle, formId }) {
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const { csrfFetch } = useContext(AuthContext);
  const isNew = !entityId;

  const { data: metadata, error: loadError, isValidating } = useSWR(
    `/api/schemacrud/${schemaName}${isNew ? '' : `/${entityId}`}`, fetchJson);
  const loadedValues = metadata?.values;
  const [formValues, setFormValues] = useState(loadedValues);
  const [isValid, setIsValid] = useState({});
  const [tryToSubmit, setTryToSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // The form's values reset whenever newly loaded values arrive (another record, or a reload that changed them).
  // Done during render rather than in an effect, so React doesn't render once with the stale values first:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [valuesLoadedFrom, setValuesLoadedFrom] = useState(loadedValues);
  if (loadedValues !== valuesLoadedFrom) {
    setValuesLoadedFrom(loadedValues);
    setFormValues(loadedValues);
  }

  /** Checks every field (showing the errors from now on); true if they're all valid. */
  const fieldsAreValid = () => {
    setTryToSubmit(true);
    setErrorMessage(null);
    const validity = validateAll(metadata.fields, formValues);
    setIsValid(validity);
    return Object.values(validity).every(Boolean);
  };

  /** Sends a request; returns its response if it succeeded, else null after showing why. */
  const send = async (method, url, body) => {
    const response = await sendOrShowError(() => csrfFetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }), setErrorMessage);
    if (!response) {
      return null;
    }
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response));
      return null;
    }
    return response;
  };

  const save = useDebouncedCallback(async () => {
    if (!fieldsAreValid()) {
      return;
    }
    const response = isNew
      ? await send('POST', `/api/schemacrud/${schemaName}`, formValues)
      : await send('PUT', `/api/schemacrud/${schemaName}/${entityId}`, formValues);
    if (response) {
      const { id: savedId } = await response.json();
      updateOpenFormUrl(formUrl(schemaName, formTitle, savedId));
    }
  }, CLICK_DEBOUNCE_MS);

  const openNew = useDebouncedCallback(() => {
    updateOpenFormUrl(formUrl(schemaName, formTitle, null));
  }, CLICK_DEBOUNCE_MS);

  const deleteRecord = useDebouncedCallback(async () => {
    if (!fieldsAreValid()) {
      return;
    }
    if (await send('DELETE', `/api/schemacrud/${schemaName}/${entityId}`)) {
      updateOpenFormUrl(formUrl(schemaName, formTitle, null));
    }
  }, CLICK_DEBOUNCE_MS);

  // A new record can only be saved
  const actions = isNew
    ? [{ key: 'save', icon: <SaveIcon />, title: 'حفظ', onClick: save }]
    : [
      { key: 'add', icon: <AddIcon />, title: 'جديد', onClick: openNew },
      { key: 'save', icon: <SaveIcon />, title: 'حفظ', onClick: save },
      { key: 'delete', icon: <DeleteIcon />, title: 'حذف', onClick: deleteRecord },
    ];

  const fieldsReady = !isValidating && metadata && formValues;

  return <Container maxWidth="sm">
    {loadError && <Alert severity="error">{loadError.message}</Alert>}
    {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
    <Stack spacing={2} sx={{ p: 1 }}>
      <Typography variant="h7" component="div">{formTitle}</Typography>
      {fieldsReady && <FormFields
        formFields={metadata.fields}
        formValues={formValues}
        setFormValues={setFormValues}
        isValid={isValid}
        setIsValid={setIsValid}
        tryToSubmit={tryToSubmit}
      />}
    </Stack>
    <SpeedDial ariaLabel="Page SpeedDial" sx={{ position: 'absolute', bottom: 10, right: 16 }} icon={<SpeedDialIcon />}>
      {actions.map((action) => <SpeedDialAction key={action.key} icon={action.icon}
        slotProps={{ tooltip: { title: action.title } }} onClick={action.onClick} />)}
    </SpeedDial>
  </Container>;
}
