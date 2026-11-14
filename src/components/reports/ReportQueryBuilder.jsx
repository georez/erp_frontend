'use client';

import { Stack } from '@mui/material';
import { QueryBuilder, ValueEditor } from 'react-querybuilder';
import { TextDateTimeField } from '@/components/ui/DateTimeFields';

// The columns' input types that take a date picker, and its kind
const PICKER_KINDS = { date: 'date', 'datetime-local': 'datetime' };
const NO_VALUE_OPERATORS = new Set(['null', 'notNull']);
const TWO_VALUE_OPERATORS = new Set(['between', 'notBetween']);

/**
 * A rule's value: a date or date-time column's in the app's date pickers (DD/MM/YYYY), held as the default editor's
 * native fields held it ("YYYY-MM-DD", "YYYY-MM-DDTHH:mm"; between: both, comma separated); any other in the default
 * editor.
 */
function ReportValueEditor(props) {
  const { inputType, operator, value, handleOnChange, disabled } = props;
  const kind = PICKER_KINDS[inputType];
  if (!kind || NO_VALUE_OPERATORS.has(operator)) {
    return <ValueEditor {...props} />;
  }
  const picker = (shown, onChange) => <TextDateTimeField kind={kind} value={shown} onChange={onChange}
    disabled={disabled} sx={{ minWidth: kind === 'date' ? 210 : 270 }} />;

  if (TWO_VALUE_OPERATORS.has(operator)) {
    const [from = '', to = ''] = Array.isArray(value) ? value : String(value ?? '').split(',');
    return <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center' }}>
      {picker(from, (next) => handleOnChange(`${next},${to}`))}
      {picker(to, (next) => handleOnChange(`${from},${next}`))}
    </Stack>;
  }
  return picker(String(value ?? ''), handleOnChange);
}

const CONTROL_ELEMENTS = { valueEditor: ReportValueEditor };

/** The report's query builder (search params 2), its date columns filtered with the app's date pickers. */
export default function ReportQueryBuilder(props) {
  return <QueryBuilder {...props} controlElements={CONTROL_ELEMENTS} />;
}
