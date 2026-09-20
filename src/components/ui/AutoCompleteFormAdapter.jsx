import { useDebounce } from 'use-debounce';
import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { validateFormField } from '@/utils/formValidation';

function getObjectId(option) {
  const idK = Object.keys(option).filter(k => k === 'id')[0];
  return option[idK];
}

function optToStr(option) {
  return Object.values(option).join(' | ');
}

const fetcher = (url) => fetch(url, {
  credentials: "include"
}).then((res) => res.json());

function useIsValueChanged(
  setIsValid, fieldName, disabled,
  validationType, required, value
) {
  const [isValueChanged, setIsValueChanged] = useState(false);
  useEffect(() => {
    if (isValueChanged) {
      setIsValid((prev) => ({
        ...prev,
        [fieldName]: !!disabled || validateFormField(validationType, required, null, value)
      }));
    }
  }, [isValueChanged, validationType, value]);
  return [isValueChanged, setIsValueChanged];
}

function useDebouncedQueryParams() {
  const [autoCompleteInputValue, setAutoCompleteInputValue] = useState('');
  const [debouncedAutoCompleteInputValue] = useDebounce(autoCompleteInputValue, 200);
  const queryParams = new URLSearchParams({
    query: debouncedAutoCompleteInputValue.trim()
  }).toString();
  return [queryParams, autoCompleteInputValue, setAutoCompleteInputValue];
}

export default function AutoCompleteFormAdapter({
  fieldName,
  displayName,
  validationType,
  linkEntity,
  required,
  disabled,
  value,
  setFormValues,
  isValid,
  setIsValid,
  tryToSubmit,

  setChanged = null,
  setSelectedObj = null,
  setHighlightedObject = null,
  otherAutoCompleteProps = {},
  otherTextFieldProps = {},
}) {
  const [isValueChanged, setIsValueChanged] = useIsValueChanged(setIsValid, fieldName, disabled, validationType, required, value);
  const [queryParams, autoCompleteInputValue, setAutoCompleteInputValue] = useDebouncedQueryParams();
  const [localSelectedObject, setLocalSelectedObject] = useState(null);
  const { data: options = [], isValidating } = useSWR(
    `/api/schemacrud/search/entity/${linkEntity}?${queryParams}`,
    fetcher,
  );

  useEffect(() => {
    const updateSelectedObject = async () => {
      if (value) {
        const queryParams = new URLSearchParams({
          id: value
        }).toString();

        // here, it is assumed that field data would result in
        // a list of search results that contains only one element -
        // the selected object.
        const results = await fetch(
          `/api/schemacrud/search/entity/${linkEntity}?${queryParams}`,
        );
        const jsonList = await results.json();
        const selectedObject = jsonList[0];
        setLocalSelectedObject(selectedObject);
        setSelectedObj?.(selectedObject);
      }
    };

    updateSelectedObject();
  }, [value, linkEntity, setSelectedObj]);

  return (
    <Autocomplete
      {...otherAutoCompleteProps}
      autoHighlight
      includeInputInList
      selectOnFocus
      clearOnEscape
      handleHomeEndKeys
      disabled={disabled}
      loading={isValidating}
      value={localSelectedObject || null}
      onChange={(_e, newValue) => {
        setFormValues((prev) => ({ ...prev, [fieldName]: newValue ? getObjectId(newValue) : null }));
        setLocalSelectedObject(newValue);
        setIsValueChanged(true);
        setChanged?.(true);
        setSelectedObj?.(newValue);
      }}
      onHighlightChange={(_e, option) => {
        setHighlightedObject?.(option);
      }}
      inputValue={autoCompleteInputValue || ''}
      onInputChange={(_e, newInputValue) => {
        setAutoCompleteInputValue(newInputValue);
      }}
      filterOptions={(options) => options}
      options={options}
      getOptionLabel={(option) => optToStr(option)}
      isOptionEqualToValue={(option, value) =>
        getObjectId(option) === getObjectId(value)
      }
      renderInput={(params) => (
        <TextField
          {...params}
          {...otherTextFieldProps}
          size='small'
          variant="outlined"
          required={required}
          disabled={disabled}
          label={displayName}
          error={
            (isValueChanged && !isValid) ||
            (tryToSubmit && !isValid)
          }
          helperText={
            (isValueChanged && !isValid) ||
              (tryToSubmit && !isValid) ?
              `${displayName} غير صحيح` :
              null
          }
          onFocus={(e) => {
            try {
              e.target.select();
            } catch (err) { }
          }}
        />
      )}
    />
  );
}
