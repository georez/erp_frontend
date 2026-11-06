'use client';

import { useMemo, useState } from 'react';
import { buildAccountTree, parentAccountIds, treeDepth, visibleTreeRows } from '@/utils/accountTree';

/**
 * An account tree's state (the trial balance, the chart of accounts): which accounts are expanded, and the rows to
 * show for them. Each new result opens the whole tree.
 *
 * @param {Array<object>} rows  the report's rows, in sort_path order (see utils/accountTree.js)
 * @returns {{items: Array<object>, depth: number, shownLevels: number|'', toggle: Function, showLevels: Function}}
 */
export function useAccountTree(rows) {
  const roots = useMemo(() => buildAccountTree(rows), [rows]);
  const [expandedIds, setExpandedIds] = useState(() => parentAccountIds(roots));
  // What the levels box shows: how many levels are open, or '' once accounts are opened or closed one by one
  const [shownLevels, setShownLevels] = useState(() => treeDepth(roots) || '');

  // A new result opens the whole tree. Set during render, so its rows never show closed first:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [openedFor, setOpenedFor] = useState(rows);
  if (rows !== openedFor) {
    setOpenedFor(rows);
    setExpandedIds(parentAccountIds(roots));
    setShownLevels(treeDepth(roots) || '');
  }

  const items = useMemo(() => visibleTreeRows(roots, expandedIds), [roots, expandedIds]);
  const depth = useMemo(() => treeDepth(roots), [roots]);

  /** Expands or collapses one account. */
  const toggle = (accountId) => {
    setShownLevels('');
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  /** Shows the tree down to a level: 1 for the top accounts only, the tree's depth for all of it. */
  const showLevels = (levels) => {
    setShownLevels(levels);
    setExpandedIds(parentAccountIds(roots, levels - 1));
  };

  return { items, depth, shownLevels, toggle, showLevels };
}
