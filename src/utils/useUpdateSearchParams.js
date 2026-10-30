import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import LZString from 'lz-string';

/**
 * The dashboard's open windows from the URL's openForms ([{ formId, url, formTitle }], compressed); null without one.
 * A link edited or cut short reads as no windows rather than breaking the page.
 */
export function readOpenForms(searchParams) {
  const compressed = searchParams.get('openForms');
  if (!compressed) {
    return null;
  }
  try {
    const openForms = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed));
    return Array.isArray(openForms) ? openForms.filter((form) => typeof form?.formId === 'string'
      && typeof form.url === 'string') : [];
  } catch {
    return [];
  }
}

export function useUpdateSearchParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Helper to create a new query string with updated values
  const createQueryString = useCallback(
    (name, value) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name); // Remove param if value is empty
      }
      return params.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (name, value) => {
    // Construct new URL path
    const newQuery = createQueryString(name, value);

    // Navigate without triggering a full page reload
    router.replace(`${pathname}?${newQuery}`, { scroll: false });
  };

  return handleFilterChange;
}

export function useUpdateMultipleSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleFilterChange = (newParams) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return handleFilterChange;
}

export function useUpdateOpenForms(formId) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const openForms = readOpenForms(urlSearchParams);
  const handleFilterChange = useUpdateSearchParam();
  if (openForms) {
    return (url) => {
      const newOpenForms = openForms.map(openForm =>
        openForm.formId !== formId ?
          openForm :
          ({ ...openForm, url })
      );
      handleFilterChange('openForms', LZString.compressToEncodedURIComponent(JSON.stringify(newOpenForms)));
    }
  } else {
    return (url, refresh) => {
      router.push(url);
      if (refresh) {
        window.location.reload()
      }
    };
  }
}

/**
 * Returns a function that opens a dashboard URL as a new window (a draggable form) in the dashboard and
 * focuses it. Only for components rendered on the /dashboard page.
 */
export function useOpenForm() {
  const searchParams = useSearchParams();
  const openForms = readOpenForms(searchParams) ?? [];
  const handleFilterChange = useUpdateMultipleSearchParams();
  return (formId, url, formTitle) => {
    const updatedOpenForms = [...openForms, { formId, url, formTitle }];
    handleFilterChange({ 'openForms': LZString.compressToEncodedURIComponent(JSON.stringify(updatedOpenForms)), 'focusedForm': formId });
  };
}
