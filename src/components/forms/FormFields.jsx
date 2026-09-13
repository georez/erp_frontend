import { Container, Stack, TextField } from "@mui/material";
import { useEffect, useState } from "react";


function TextFieldAdapter({
  fieldName,
  displayName,
  validationType,
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
      if (validationType === "id") {
        setIsValid((prev) => ({ ...prev, [fieldName]: /^(0|([1-9][0-9]*))$/.test(value) || (!required && value === '') }));
      }
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
      setFormValues((prev) => ({ ...prev, [fieldName]: event.target.value }));
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
        if (formField.validationType === "id") {
          return <TextFieldAdapter
            key={formField.fieldName}
            fieldName={formField.fieldName}
            displayName={formField.displayName}
            validationType={formField.validationType}
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