'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * The values and errors of a document form's entry row (the fields of one line, before OK sends it).
 *
 * @param emptyEntry the row's fields when empty
 */
export function useEntryRow(emptyEntry) {
  const [entry, setEntry] = useState(emptyEntry);
  const [errors, setErrors] = useState({});

  /**
   * For a field's onChange: sets that field. Its error goes as it's typed in again (its hint shows again); OK checks
   * it anew.
   *
   * @param dependentFields fields whose errors were about this field's value and go with it too, e.g. a quantity over
   *                        what the product had available, when another product is chosen
   */
  const setField = (field, dependentFields = []) => (value) => {
    setEntry((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      const cleared = [field, ...dependentFields].filter((name) => previous[name] != null);
      return cleared.length === 0 ? previous
        : { ...previous, ...Object.fromEntries(cleared.map((name) => [name, null])) };
    });
  };

  /** Empties the row (a new document). */
  const clear = () => {
    setEntry(emptyEntry);
    setErrors({});
  };

  /** Empties the row but for the product, which stays chosen: after a line is saved, its next batch often follows. */
  const clearKeepingProduct = () => {
    setEntry((previous) => ({ ...emptyEntry, productId: previous.productId }));
    setErrors({});
  };

  /**
   * Puts a grid row's values into the entry row, to change the line, and moves the cursor to the field given, its
   * text selected so typing replaces it. Rendered at once (flushSync): the grid calls this from its own listener, where
   * React would render later, and the field must hold its value before it's selected.
   */
  const fill = (values, fieldRef) => {
    flushSync(() => {
      setEntry(values);
      setErrors({});
    });
    fieldRef.current?.focus();
    fieldRef.current?.select();
  };

  return { entry, setEntry, setField, errors, setErrors, clear, clearKeepingProduct, fill };
}
