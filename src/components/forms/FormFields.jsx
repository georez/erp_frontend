import { createDateTime, formatDateTime, validateFormField } from "@/utils/formValidation";
import { Checkbox, FormControl, FormControlLabel, FormHelperText, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { DatePicker, DateTimePicker, LocalizationProvider, TimePicker } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { useEffect, useState } from "react";
import AutoCompleteFormAdapter from "../ui/AutoCompleteFormAdapter";


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
  setIsValid,
  tryToSubmit
}) {

  const [isValueChanged, setIsValueChanged] = useState(false);

  useEffect(() => {
    if (isValueChanged) {
      setIsValid((prev) => ({
        ...prev,
        [fieldName]: !!disabled || validateFormField(validationType, required, validation, value)
      }));
    }
  }, [isValueChanged, validationType, value])

  useEffect(() => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value || null }));
  }, [value, setFormValues]);
  
  return <TextField
    error={
      (isValueChanged && !isValid) ||
      (tryToSubmit && !isValid)
    }
    helperText={
      (isValueChanged && !isValid) ||
        (tryToSubmit && !isValid) ?
        `${displayName} غير صحيح` :
        null}
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

function SelectFieldAdapter({
  fieldName,
  displayName,
  validationType,
  choices,
  validation,
  required,
  disabled,
  value,
  setFormValues,
  isValid,
  setIsValid,
  tryToSubmit
}) {

  const [isValueChanged, setIsValueChanged] = useState(false);

  useEffect(() => {
    if (isValueChanged) {
      setIsValid((prev) => ({
        ...prev,
        [fieldName]: !!disabled || validateFormField(validationType, required, validation, value)
      }));
    }
  }, [isValueChanged, validationType, value])

  useEffect(() => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value || null }));
  }, [value, setFormValues]);

  return <FormControl
    variant="outlined"
    fullWidth
    error={(isValueChanged && !isValid) ||
      (tryToSubmit && !isValid)}
    size="small"
    required={required}
  >
    <InputLabel id={fieldName}>{displayName}</InputLabel>
    <Select
      labelId={fieldName}
      value={value}
      onChange={(event) => {
        const newValue = event.target.value;
        setFormValues((prev) => ({ ...prev, [fieldName]: newValue === '' ? null : newValue }));
        setIsValueChanged(true);
      }}
      label={displayName}
    >
      {!required && <MenuItem value=""><em>لا شيء</em></MenuItem>}
      {choices.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
    </Select>
    {(isValueChanged && !isValid) ||
      (tryToSubmit && !isValid) ?
      <FormHelperText>{`${displayName} غير صحيح`}</FormHelperText> :
      null}
  </FormControl>
}

function CheckBoxAdapter({
  fieldName,
  displayName,
  disabled,
  value,
  setFormValues,
}) {

  useEffect(() => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value || false }));
  }, [value]);

  return <FormControlLabel
    disabled={disabled}
    control={<Checkbox />}
    label={displayName}
    checked={value}
    onChange={(e) => {
      setFormValues((prev) => ({ ...prev, [fieldName]: e.target.checked }));
    }}
  />
}

function getDateTimeFieldComponent(fieldType) {
  switch (fieldType) {
    case "date":
      return DatePicker;
    case "time":
      return TimePicker;
    case "datetime":
      return DateTimePicker;
    default:
      return null;
  }
}

function DateTimePickerAdapter({
  fieldType,
  fieldName,
  displayName,
  validationType,
  validation,
  required,
  disabled,
  value,
  setFormValues,
  isValid,
  setIsValid,
  tryToSubmit
}) {
  const [isValueChanged, setIsValueChanged] = useState(false);
  const DateTimeComponent = getDateTimeFieldComponent(fieldType);

  useEffect(() => {
    if (isValueChanged) {
      setIsValid((prev) => ({
        ...prev,
        [fieldName]: !!disabled || validateFormField(validationType, required, validation, value)
      }));
    }
  }, [isValueChanged, validationType, value])

  useEffect(() => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value || null }));
  }, [value, setFormValues]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimeComponent
        name={fieldName}
        value={value ? createDateTime(fieldType, value) : null}
        disabled={disabled}
        onChange={(newValue) => {
          setFormValues((prev) => ({ ...prev, [fieldName]: newValue ? formatDateTime(fieldType, newValue) : null }));
          setIsValueChanged(true);
        }}
        label={displayName}
        slotProps={{
          field: {
            clearable: !required,
          },
          textField: {
            size: "small",
            required: required,
            error:
              (isValueChanged && !isValid) ||
              (tryToSubmit && !isValid),
            helperText:
              (isValueChanged && !isValid) ||
                (tryToSubmit && !isValid) ?
                `${displayName} غير صحيح` :
                null,
          },
        }}
      />
    </LocalizationProvider>
  );
}


export default function FormFields({
  formFields,
  formValues,
  setFormValues,
  isValid,
  setIsValid,
  tryToSubmit
}) {
  return formFields.map(formField => {
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
        setIsValid={setIsValid}
        tryToSubmit={tryToSubmit} />
    } else if (
      formField.validationType === 'datetime' ||
      formField.validationType === 'date' ||
      formField.validationType === 'time'
    ) {
      return <DateTimePickerAdapter
        key={formField.fieldName}
        fieldType={formField.validationType}
        fieldName={formField.fieldName}
        displayName={formField.displayName}
        validationType={formField.validationType}
        validation={formField.validation}
        required={formField.required}
        disabled={formField.disabled}
        value={formValues[formField.fieldName] || null}
        setFormValues={setFormValues}
        isValid={!!isValid[formField.fieldName]}
        setIsValid={setIsValid}
        tryToSubmit={tryToSubmit} />
    } else if (formField.validationType === 'link') {
      return <AutoCompleteFormAdapter
        key={formField.fieldName}
        fieldName={formField.fieldName}
        displayName={formField.displayName}
        validationType={formField.validationType}
        linkEntity={formField.linkEntity}
        required={formField.required}
        disabled={formField.disabled}
        value={formValues[formField.fieldName] || null}
        setFormValues={setFormValues}
        isValid={!!isValid[formField.fieldName]}
        setIsValid={setIsValid}
        tryToSubmit={tryToSubmit}
      />
    } else if (formField.validationType === "choices") {
      return <SelectFieldAdapter
        key={formField.fieldName}
        fieldName={formField.fieldName}
        displayName={formField.displayName}
        validationType={formField.validationType}
        choices={formField.choices}
        validation={formField.validation}
        required={formField.required}
        disabled={formField.disabled}
        value={formValues[formField.fieldName] || ''}
        setFormValues={setFormValues}
        isValid={!!isValid[formField.fieldName]}
        setIsValid={setIsValid}
        tryToSubmit={tryToSubmit} />
    } else if (formField.validationType === "boolean") {
      return <CheckBoxAdapter
        key={formField.fieldName}
        fieldName={formField.fieldName}
        displayName={formField.displayName}
        disabled={formField.disabled}
        value={formValues[formField.fieldName] || false}
        setFormValues={setFormValues} />
    }
  });
}