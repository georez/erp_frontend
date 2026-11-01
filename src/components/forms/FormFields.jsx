import { createDateTime, formatDateTime } from "@/utils/formValidation";
import {
  Checkbox, FormControl, FormControlLabel, FormHelperText, InputLabel, MenuItem, Select, TextField,
} from "@mui/material";
import { DatePicker, DateTimePicker, LocalizationProvider, TimePicker } from "@mui/x-date-pickers";
import { LtrPickerDialog, LtrPickerPopper } from "@/components/ui/LtrPickerPopup";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import AutoCompleteFormAdapter from "../ui/AutoCompleteFormAdapter";
import {
  invalidText, setFieldValue, showsError, useFieldValidity, useKeepInFormValues,
} from "./fieldState";

/*
 * The fields of a generic form (SchemaCrud) or a report's params, built from the backend's field metadata: a text
 * field, a list of choices, a date/time picker, a link to another record, or a checkbox, by the field's
 * validationType. Each keeps its value in formValues and its validity in isValid (see fieldState).
 */

function TextFieldAdapter({ field, value, setFormValues, isValid, setIsValid, tryToSubmit }) {
  const { fieldName, displayName, required, disabled } = field;
  const [changed, setChanged] = useFieldValidity({ ...field, value, setIsValid });
  useKeepInFormValues(fieldName, value, setFormValues);
  const hasError = showsError({ changed, tryToSubmit, isValid });

  return <TextField
    size="small"
    label={displayName}
    value={value}
    required={required}
    disabled={disabled}
    error={hasError}
    helperText={hasError ? invalidText(displayName) : null}
    onChange={(event) => {
      setFieldValue(setFormValues, fieldName, event.target.value);
      setChanged(true);
    }}
  />;
}

function SelectFieldAdapter({ field, value, setFormValues, isValid, setIsValid, tryToSubmit }) {
  const { fieldName, displayName, choices, required } = field;
  const [changed, setChanged] = useFieldValidity({ ...field, value, setIsValid });
  useKeepInFormValues(fieldName, value, setFormValues);
  const hasError = showsError({ changed, tryToSubmit, isValid });

  return <FormControl variant="outlined" fullWidth size="small" required={required} error={hasError}>
    <InputLabel id={fieldName}>{displayName}</InputLabel>
    <Select
      labelId={fieldName}
      label={displayName}
      value={value}
      onChange={(event) => {
        setFieldValue(setFormValues, fieldName, event.target.value);
        setChanged(true);
      }}
    >
      {!required && <MenuItem value=""><em>لا شيء</em></MenuItem>}
      {choices.map((choice) => <MenuItem key={choice} value={choice}>{choice}</MenuItem>)}
    </Select>
    {hasError && <FormHelperText>{invalidText(displayName)}</FormHelperText>}
  </FormControl>;
}

function CheckBoxAdapter({ field, value, setFormValues }) {
  const { fieldName, displayName, disabled } = field;
  useKeepInFormValues(fieldName, value, setFormValues, false);

  return <FormControlLabel
    disabled={disabled}
    control={<Checkbox />}
    label={displayName}
    checked={value}
    onChange={(event) => {
      setFormValues((previous) => ({ ...previous, [fieldName]: event.target.checked }));
    }}
  />;
}

/**
 * The MUI picker for the field's type. A component (rather than a function returning one) so React sees a fixed
 * component per type instead of one chosen anew on every render.
 */
function DateTimeFieldPicker({ fieldType, ...pickerProps }) {
  switch (fieldType) {
    case "date":
      return <DatePicker {...pickerProps} />;
    case "time":
      return <TimePicker {...pickerProps} />;
    case "datetime":
      return <DateTimePicker {...pickerProps} />;
    default:
      return null;
  }
}

function DateTimePickerAdapter({ field, value, setFormValues, isValid, setIsValid, tryToSubmit }) {
  const { fieldName, displayName, validationType: fieldType, required, disabled } = field;
  const [changed, setChanged] = useFieldValidity({ ...field, value, setIsValid });
  useKeepInFormValues(fieldName, value, setFormValues);
  const hasError = showsError({ changed, tryToSubmit, isValid });

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimeFieldPicker
        fieldType={fieldType}
        name={fieldName}
        label={displayName}
        value={value ? createDateTime(fieldType, value) : null}
        disabled={disabled}
        onChange={(picked) => {
          const formatted = picked ? formatDateTime(fieldType, picked) : null;
          setFormValues((previous) => ({ ...previous, [fieldName]: formatted }));
          setChanged(true);
        }}
        // The calendar (or clock) left to right, like a printed calendar; the field stays right to left
        slots={{ popper: LtrPickerPopper, dialog: LtrPickerDialog }}
        slotProps={{
          field: { clearable: !required },
          textField: {
            size: "small",
            required,
            error: hasError,
            helperText: hasError ? invalidText(displayName) : null,
          },
        }}
      />
    </LocalizationProvider>
  );
}

/** One field, by its validationType; nothing for a type no field is made for. */
function FormField({ field, formValues, setFormValues, isValid, setIsValid, tryToSubmit }) {
  const stored = formValues[field.fieldName];
  const fieldProps = { field, setFormValues, isValid: !!isValid[field.fieldName], setIsValid, tryToSubmit };

  switch (field.validationType) {
    case "id":
    case "number":
    case "string":
      return <TextFieldAdapter {...fieldProps} value={stored || ''} />;
    case "datetime":
    case "date":
    case "time":
      return <DateTimePickerAdapter {...fieldProps} value={stored || null} />;
    case "link":
      return <AutoCompleteFormAdapter {...fieldProps} value={stored || null} />;
    case "choices":
      return <SelectFieldAdapter {...fieldProps} value={stored || ''} />;
    case "boolean":
      return <CheckBoxAdapter {...fieldProps} value={stored || false} />;
    default:
      return null;
  }
}

/**
 * The form's fields, in the order the metadata gives.
 *
 * @param formFields  the fields' metadata (fieldName, displayName, validationType, validation, required, ...)
 * @param formValues  the values, by field name; each field keeps its own there
 * @param isValid     each field's validity, by field name, kept by the fields once changed
 * @param tryToSubmit true once the form tried to save: every invalid field shows its error
 */
export default function FormFields({ formFields, formValues, setFormValues, isValid, setIsValid, tryToSubmit }) {
  return formFields.map((field) => <FormField key={field.fieldName} field={field} formValues={formValues}
    setFormValues={setFormValues} isValid={isValid} setIsValid={setIsValid} tryToSubmit={tryToSubmit} />);
}
