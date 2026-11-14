'use client';

import { useImperativeHandle, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { DatePicker, DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import RtlProvider from '@mui/system/RtlProvider';
import { LtrPickerDialog, LtrPickerPopper } from '@/components/ui/LtrPickerPopup';

/*
 * How every date picker in the app shows a date: day first, DD/MM/YYYY. A date-time picker shows the time after it, as
 * the pickers did before (12-hour, with AM/PM).
 */
export const DATE_SHOWN = 'DD/MM/YYYY';
export const DATE_TIME_SHOWN = `${DATE_SHOWN} hh:mm A`;

// The calendar (or clock) left to right, like a printed calendar; the field stays right to left
export const PICKER_SLOTS = { popper: LtrPickerPopper, dialog: LtrPickerDialog };

/**
 * Around every picker: dayjs dates, and the field's parts in the order they're written. Right to left, MUI would put a
 * date-time's groups the other way round ("AM hh:mm DD/MM/YYYY"), so typing the date and then the time would stop at
 * the year, and the arrow keys would move against what's shown. The field still sits right to left on the page: its
 * label and outline come from the styles, which this doesn't change.
 */
export function PickerProvider({ children }) {
  return <LocalizationProvider dateAdapter={AdapterDayjs}>
    <RtlProvider value={false}>{children}</RtlProvider>
  </LocalizationProvider>;
}

// value: how the form holds it, as a datetime-local field did ('' for none)
const KINDS = {
  date: { Picker: DatePicker, valueFormat: 'YYYY-MM-DD', shown: DATE_SHOWN },
  datetime: { Picker: DateTimePicker, valueFormat: 'YYYY-MM-DDTHH:mm', shown: DATE_TIME_SHOWN },
};

const parse = (value, valueFormat) => (value ? dayjs(value, valueFormat, true) : null);

/**
 * A date or date-time picker over a text value, for a document form's own field: '' for none (the clear button gives
 * it), otherwise "YYYY-MM-DD" (date) or "YYYY-MM-DDTHH:mm" (datetime).
 *
 * What's typed stays in the picker until it's a whole date: only then, or once cleared, does onChange get it. The form
 * keeps its last whole value meanwhile, and rendering again doesn't wipe what's half typed.
 *
 * @param kind     'date' or 'datetime'
 * @param onAccept a date picked from the calendar (or cleared), to save it at once; leaving the field calls onBlur
 * @param fieldRef for Enter moving between fields (moveOnEnter): focuses the field, and tells whether a key pressed
 *                 came from inside it
 */
export function TextDateTimeField({
  kind, value, onChange, onAccept, onBlur, label, disabled, helperText, fullWidth, sx, fieldRef, labelledBy,
}) {
  const { Picker, valueFormat, shown } = KINDS[kind];
  const [picked, setPicked] = useState(() => parse(value, valueFormat));
  // The value the picker last showed: another one (a document loaded, a form cleared) is shown in its place
  const [pickedFrom, setPickedFrom] = useState(value);
  if (value !== pickedFrom) {
    setPickedFrom(value);
    setPicked(parse(value, valueFormat));
  }

  const pickerFieldRef = useRef(null);
  const rootRef = useRef(null);
  useImperativeHandle(fieldRef, () => ({
    focus: () => pickerFieldRef.current?.focusField(0),
    contains: (node) => rootRef.current?.contains(node) ?? false,
    disabled,
  }), [disabled]);

  const isWhole = (next) => next == null || next.isValid();
  const textOf = (next) => (next == null ? '' : next.format(valueFormat));

  return <PickerProvider>
    <Picker value={picked} format={shown} label={label} disabled={disabled}
      onChange={(next) => {
        setPicked(next);
        if (isWhole(next)) {
          setPickedFrom(textOf(next));
          onChange(textOf(next));
        }
      }}
      onAccept={(next) => isWhole(next) && onAccept?.(textOf(next))}
      slots={PICKER_SLOTS}
      slotProps={{
        // The field's own ref (the picker takes none): focusField for Enter moving into it
        field: { clearable: !disabled, fieldRef: pickerFieldRef },
        textField: { size: 'small', fullWidth, helperText, onBlur, sx, ref: rootRef, 'aria-labelledby': labelledBy },
      }} />
  </PickerProvider>;
}
