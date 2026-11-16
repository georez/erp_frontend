import { useMemo } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/utils/fetchJson';

// The permissions that aren't an endpoint (backend Permissions.NOT_ENDPOINTS)
export const SALES_CHANGE_DISCOUNTS = 'sales:change-discounts';
export const SALES_POST_WITHOUT_BATCHES = 'sales:post-without-batches';

/**
 * What the signed-in user may do (GET /api/me/permissions): has(permission) is true when their role has it, it was
 * granted to them, or they're the admin. A permission is an endpoint as "METHOD /path", e.g.
 * "POST /api/sales-invoices/{id}/post", or one of the constants above. False for everything until they've loaded.
 */
export function usePermissions() {
  const { data } = useSWR('/api/me/permissions', fetchJson);
  return useMemo(() => {
    const permissions = new Set(data?.permissions ?? []);
    return { loaded: data !== undefined, has: (permission) => permissions.has(permission) };
  }, [data]);
}
