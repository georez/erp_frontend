import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function useUpdateSearchParams() {
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
    router.push(`${pathname}?${newQuery}`, { scroll: false });
  };

  return handleFilterChange;
}