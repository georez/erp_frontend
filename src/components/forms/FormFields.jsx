import { validateFormField } from "@/utils/formValidation";
import { Container, Stack, TextField } from "@mui/material";
import { useEffect, useState } from "react";


function TextFieldAdapter({
  fieldName,
  displayName,
  validationType,
  validation,
  required,
  disabled,
  value,
  setFormValues,
  isValid,
  setIsValid
}) {

  const [isValueChanged, setIsValueChanged] = useState(false);

  useEffect(() => {
    if (isValueChanged) {
      setIsValid((prev) => ({ ...prev, [fieldName]: validateFormField(validationType, required, validation, value) }));
    }
  }, [isValueChanged, validationType, value])

  return <TextField
    error={isValueChanged && !isValid}
    helperText={isValueChanged && !isValid && `${displayName} غير صحيح`}
    size="small"
    label={displayName}
    value={value}
    required={required}
    disabled={disabled}
    onChange={(event) => {
      const newValue = event.target.value;
      setFormValues((prev) => ({ ...prev, [fieldName]: newValue === '' ? null : newValue }));
      setIsValueChanged(true);
    }}
  />
}

export default function FormFields({
  formFields,
  formValues,
  setFormValues,
  isValid,
  setIsValid
}) {
  return <Container maxWidth="sm">
    <Stack spacing={2} sx={{ p: 1 }}>
      {formFields.map(formField => {
        if (
          formField.validationType === "id" ||
          formField.validationType === 'number' ||
          formField.validationType === 'string'
        ) {
          return <TextFieldAdapter
            key={formField.fieldName}
            fieldName={formField.fieldName}
            displayName={formField.displayName}
            validationType={formField.validationType}
            validation={formField.validation}
            required={formField.required}
            disabled={formField.disabled}
            value={formValues[formField.fieldName] || ''}
            setFormValues={setFormValues}
            isValid={!!isValid[formField.fieldName]}
            setIsValid={setIsValid} />
        }
      })}
    </Stack>
  </Container>

}