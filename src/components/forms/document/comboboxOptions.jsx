'use client';

import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';

/** The Arabic texts of ComboBox2 (Combobox) in the document forms. */
const COMBOBOX_MESSAGES = {
  clear: 'مسح الاختيار',
  typeToJump: (count) => `${count.toLocaleString('ar-EG')} عنصر · اكتب للانتقال`,
  jumpedBy: (text) => <>انتقال إلى «<bdi>{text}</bdi>»</>,
  sameCode: (code, count) => <>{count} أصناف بالباركود <bdi>{code}</bdi>: اختر واحداً</>,
};

/** The props every combobox of the document forms takes. */
export const COMBOBOX_PROPS = { fullWidth: true, messages: COMBOBOX_MESSAGES };

/** The accounts a manual entry's lines or a payment may go on, as ComboBox2 options with their subledgers. */
export function useAccountOptions() {
  const { data = [], error } = useSWR('/api/journal-entries/accounts', fetchJson);
  return { options: data, error, labelOf: (value) => labelOf(data, value) };
}

/**
 * All of a link entity's records (e.g. "products") as ComboBox2 options ({ value, label, code?, detail? }); labelOf:
 * a record's label by its id (null for none).
 */
export function useOptions(linkEntity) {
  const { data = [], error } = useSWR(`/api/schemacrud/options/entity/${linkEntity}`, fetchJson);
  return { options: data, error, labelOf: (value) => labelOf(data, value) };
}

const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? null;
