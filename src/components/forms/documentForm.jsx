'use client';

import { Box, Stack, Typography } from '@mui/material';
import { Big } from 'bigdecimal.js';
import useSWR from 'swr';
import { useState } from 'react';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';
import { formatDecimal } from '@/utils/decimals';

/*
 * What the document forms (stock adjustment, purchase invoice) share: a draft filled one line at a time from an entry
 * row, with a grid of the lines as the backend has them.
 */

export const MAX_DESCRIPTION_LENGTH = 500;
// batches.batch_number is varchar(50)
export const MAX_BATCH_NUMBER_LENGTH = 50;
// The stock a product had before batches: its batch has no number (and no expiry date)
export const NO_BATCH_LABEL = 'بدون تشغيلة';

export const COMBOBOX_MESSAGES = {
  clear: 'مسح الاختيار',
  typeToJump: (count) => `${count.toLocaleString('ar-EG')} عنصر · اكتب للانتقال`,
  jumpedBy: (text) => <>انتقال إلى «<bdi>{text}</bdi>»</>,
};

// Numbers left to right inside the right-to-left grid, so a sign stays in front ("-3", not "3-"); still aligned
// with the other cells, at the column's start
export const NUMBER_CELL = { direction: 'ltr', textAlign: 'right' };

/** Decimal text from the backend ("12.5"), formatted for the grid; empty for none. */
export const formatAmount = (value) => (value == null ? '' : formatDecimal(Big(value)));

/** All of a link entity's records as ComboBox2 options ({ value, label }). */
export function useOptions(linkEntity) {
  const { data = [], error } = useSWR(`/api/schemacrud/options/entity/${linkEntity}`, fetchJson);
  return { options: data, error };
}

/** A label and its field side by side, so the header stays one line high; basis: its share of the line. */
export function Labelled({ id, label, basis, children }) {
  return <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flex: `1 1 ${basis}px`, minWidth: 0 }}>
    <Typography component="label" id={id} variant="body2" sx={{ whiteSpace: 'nowrap' }}>{label}</Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Stack>;
}

/**
 * Sending a document's requests: send(url, method, body) returns what the backend answers with ({} for an empty
 * answer), or null after setting errorMessage to why it failed. One request at a time: busy is true meanwhile, for the
 * buttons to be disabled.
 */
export function useDocumentRequests(csrfFetch) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (url, method, body) => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const res = await sendOrShowError(() => csrfFetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), setErrorMessage);
      if (!res) {
        return null;
      }
      if (!res.ok) {
        setErrorMessage(await readErrorMessage(res));
        return null;
      }
      return res.status === 204 ? {} : await res.json();
    } finally {
      setBusy(false);
    }
  };

  return { send, busy, errorMessage, setErrorMessage };
}

/**
 * For an entry row's onKeyDown: Enter moves to the next of the fields (refs, in order; the last is the OK button,
 * where Enter is a click, which sends the line). Not when ComboBox2 used it to pick from its open list (it prevents
 * the default then), nor in a field not in the list.
 */
export function moveOnEnter(event, fieldRefs) {
  if (event.key !== 'Enter' || event.defaultPrevented) {
    return;
  }
  const index = fieldRefs.findIndex((ref) => ref.current === event.target);
  const next = index >= 0 ? fieldRefs[index + 1] : undefined;
  if (next?.current) {
    event.preventDefault();
    next.current.focus();
    // A date field can't select its text
    if (next.current.type !== 'date') {
      next.current.select?.();
    }
  }
}
