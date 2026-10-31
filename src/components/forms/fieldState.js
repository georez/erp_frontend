'use client';

import { useEffect, useState } from 'react';
import { validateFormField } from '@/utils/formValidation';

/*
 * What every field of a generic form (FormFields) does alike: it keeps its value in the form's values, and its
 * validity in the form's isValid, which the form checks before saving.
 */

/**
 * The field's validity, kept in isValid (by field name) once the user has changed it, and again whenever it changes
 * after that. A disabled field is always valid.
 *
 * @returns [changed, setChanged]: whether the user has changed the field
 */
export function useFieldValidity({ fieldName, validationType, validation, required, disabled, value, setIsValid }) {
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!changed) {
      return;
    }
    const valid = !!disabled || validateFormField(validationType, required, validation, value);
    setIsValid((previous) => ({ ...previous, [fieldName]: valid }));
  }, [changed, setIsValid, fieldName, disabled, validationType, required, validation, value]);
  return [changed, setChanged];
}

/** Keeps the field in the form's values, an empty value as `empty` (null; false for a checkbox). */
export function useKeepInFormValues(fieldName, value, setFormValues, empty = null) {
  useEffect(() => {
    setFormValues((previous) => ({ ...previous, [fieldName]: value || empty }));
  }, [value, fieldName, setFormValues, empty]);
}

/** Sets the field's value in the form's values: an emptied text field as null. */
export function setFieldValue(setFormValues, fieldName, value) {
  setFormValues((previous) => ({ ...previous, [fieldName]: value === '' ? null : value }));
}

/** Whether the field shows its error: it's invalid, and the user changed it or the form tried to save. */
export function showsError({ changed, tryToSubmit, isValid }) {
  return (changed || tryToSubmit) && !isValid;
}

/** The error shown under a field. */
export function invalidText(displayName) {
  return `${displayName} غير صحيح`;
}
