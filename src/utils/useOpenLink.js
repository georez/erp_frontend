import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useIsTabletOrSmaller } from "@/utils/useIsTabletOrSmaller";
import { useOpenForm } from "@/utils/useUpdateSearchParams";

/**
 * How dashboard links open (the drawer menu and the report grid's linked cells). Links are real <a> elements
 * with target="_blank"; on the dashboard page on a large screen, a plain click opens the URL as a new dashboard
 * window instead (see openLinkOnPlainClick). Everywhere else they open in a new browser tab: on small screens
 * (where the dashboard doesn't use windows, see useIsTabletOrSmaller), on a form's own page, and on ctrl,
 * shift or middle click.
 *
 * @returns {((url: string, formTitle: string) => void) | null} opens a URL as a new dashboard window, or null
 *   when links open in a new tab. Stable while that doesn't change, so it can go into memoized values.
 */
export function useOpenLink() {
  const isInDashboard = usePathname() === '/dashboard';
  const isTabletOrSmaller = useIsTabletOrSmaller();
  const opensWindows = isInDashboard && !isTabletOrSmaller;

  // The open function changes on every render (it reads the current URL); the returned one calls the latest
  const openForm = useOpenForm();
  const openFormRef = useRef(openForm);
  useEffect(() => {
    openFormRef.current = openForm;
  });

  return useMemo(
    () => (opensWindows ? (url, formTitle) => openFormRef.current(uuidv4(), url, formTitle) : null),
    [opensWindows]
  );
}

/**
 * onClick of a link opened through useOpenLink: a plain left click opens a dashboard window; any other click,
 * or no openLink, is left to the browser (a new tab, from the link's target="_blank").
 */
export function openLinkOnPlainClick(event, openLink, url, formTitle) {
  if (!openLink || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  openLink(url, formTitle);
}
