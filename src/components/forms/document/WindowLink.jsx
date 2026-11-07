'use client';

import { openLinkOnPlainClick } from '@/utils/useOpenLink';

/** A link opening a dashboard window on a plain click (see useOpenLink). */
export function WindowLink({ target, openLink, children }) {
  return <a href={target.url} target="_blank" rel="noopener noreferrer"
    onClick={(event) => openLinkOnPlainClick(event, openLink, target.url, target.title)}>
    {children}
  </a>;
}
