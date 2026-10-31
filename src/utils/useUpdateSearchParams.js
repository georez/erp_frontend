import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LZString from 'lz-string';

/*
 * The dashboard keeps its open windows in the URL: openForms, a compressed JSON list of { formId, url, formTitle },
 * and focusedForm, the formId of the window in front. So a dashboard link opens the same windows again.
 */

/**
 * The dashboard's open windows from the URL's openForms; null without one. A link edited or cut short reads as no
 * windows rather than breaking the page.
 */
export function readOpenForms(searchParams) {
  const compressed = searchParams.get('openForms');
  if (!compressed) {
    return null;
  }
  try {
    const openForms = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed));
    if (!Array.isArray(openForms)) {
      return [];
    }
    return openForms.filter((form) => typeof form?.formId === 'string' && typeof form.url === 'string');
  } catch {
    return [];
  }
}

/** The open windows as the URL's openForms keeps them. */
export function encodeOpenForms(openForms) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(openForms));
}

/**
 * Returns a function that changes the URL's search params ({ name: value }; an empty value removes its param) without
 * reloading the page.
 */
export function useUpdateMultipleSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (changes) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([name, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(name);
      } else {
        params.set(name, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
}

/** Returns a function that changes one of the URL's search params (an empty value removes it). */
export function useUpdateSearchParam() {
  const updateSearchParams = useUpdateMultipleSearchParams();
  return (name, value) => updateSearchParams({ [name]: value });
}

/**
 * Returns a function that points a window at another URL (e.g. a draft just created, or a new record): in the
 * dashboard, the window's entry in openForms; on a form's own page, the page itself.
 */
export function useUpdateOpenForms(formId) {
  const router = useRouter();
  const openForms = readOpenForms(useSearchParams());
  const updateSearchParam = useUpdateSearchParam();

  if (!openForms) {
    // A form's own page: go to the URL
    return (url, refresh) => {
      router.push(url);
      if (refresh) {
        window.location.reload();
      }
    };
  }
  return (url) => {
    const updated = openForms.map((openForm) => (openForm.formId === formId ? { ...openForm, url } : openForm));
    updateSearchParam('openForms', encodeOpenForms(updated));
  };
}

/**
 * Returns a function that opens a dashboard URL as a new window (a draggable form) in the dashboard and focuses it.
 * Only for components rendered on the /dashboard page.
 */
export function useOpenForm() {
  const openForms = readOpenForms(useSearchParams()) ?? [];
  const updateSearchParams = useUpdateMultipleSearchParams();
  return (formId, url, formTitle) => {
    const updated = [...openForms, { formId, url, formTitle }];
    updateSearchParams({ openForms: encodeOpenForms(updated), focusedForm: formId });
  };
}
