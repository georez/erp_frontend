import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import LZString from 'lz-string';

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
  const openForms = JSON.parse(urlSearchParams.get('openForms') ?
    LZString.decompressFromEncodedURIComponent(urlSearchParams.get('openForms')) :
    null);
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