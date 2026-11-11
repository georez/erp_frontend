import { useDebounce } from 'use-debounce';
import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';
import {
  invalidText, showsError, useFieldValidity, useKeepInFormValues,
} from '@/components/forms/fieldState';

/*
 * A generic form's link to another record (a field whose validationType is "link", e.g. a customer's category): an
 * autocomplete that searches the linked records by name as the user types, and stores the chosen record's id.
 */

// The search results: { id, name }
const optionLabel = (option) => `${option.id} | ${option.name}`;
const searchUrl = (linkEntity, params) => `/api/schemacrud/search/entity/${linkEntity}?${new URLSearchParams(params)}`;

/** What's typed in the field, and the search for it, sent once typing pauses. */
function useSearchText() {
  const [text, setText] = useState('');
  const [debouncedText] = useDebounce(text, 200);
  return { text, setText, query: debouncedText.trim() };
}

/** The record the field's value (an id) points to, loaded for its label; null for none. */
function useLinkedRecord(linkEntity, value) {
  const [record, setRecord] = useState(null);
  // No value (a new record, a link left empty): none, not the record shown before. Set during render, so the old one
  // is never shown: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (!value && record != null) {
    setRecord(null);
  }
  useEffect(() => {
    if (!value) {
      return;
    }
    const loadRecord = async () => {
      // A search by id finds the one record
      let found;
      try {
        found = await fetchJson(searchUrl(linkEntity, { id: value }));
      } catch {
        found = [];
      }
      setRecord(found[0] ?? null);
    };
    loadRecord();
  }, [value, linkEntity]);
  return [record, setRecord];
}

export default function AutoCompleteFormAdapter({
  field, value, setFormValues, isValid, setIsValid, tryToSubmit,
}) {
  const { fieldName, displayName, linkEntity, required, disabled } = field;
  // A link's value is an id: no length or format of its own to check
  const [changed, setChanged] = useFieldValidity({ ...field, validation: null, value, setIsValid });
  useKeepInFormValues(fieldName, value, setFormValues);
  const search = useSearchText();
  const [selected, setSelected] = useLinkedRecord(linkEntity, value);
  // On a failed search, fetchJson throws and SWR leaves data undefined, so options stays an empty list
  // (passing the error body to Autocomplete as options would crash it)
  const { data: options = [], error: searchError, isValidating } = useSWR(
    searchUrl(linkEntity, { query: search.query }), fetchJson);
  const hasError = showsError({ changed, tryToSubmit, isValid });

  return (
    <Autocomplete
      autoHighlight
      includeInputInList
      selectOnFocus
      clearOnEscape
      handleHomeEndKeys
      disabled={disabled}
      loading={isValidating}
      value={selected || null}
      onChange={(event, record) => {
        setFormValues((previous) => ({ ...previous, [fieldName]: record ? record.id : null }));
        setSelected(record);
        setChanged(true);
      }}
      inputValue={search.text}
      onInputChange={(event, text) => search.setText(text)}
      // The backend's search has filtered them already
      filterOptions={(searched) => searched}
      options={options}
      getOptionLabel={optionLabel}
      isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
      renderInput={(params) => (
        <TextField
          {...params}
          size='small'
          variant="outlined"
          required={required}
          disabled={disabled}
          label={displayName}
          error={hasError}
          helperText={hasError ? invalidText(displayName) : (searchError?.message ?? null)}
          onFocus={(event) => event.target.select?.()}
        />
      )}
    />
  );
}
