'use client';

import { Button, IconButton, MenuItem, TextField } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { openLinkOnPlainClick } from '@/utils/useOpenLink';
import { virtualTableComponents } from '../virtualTable';
import './accountTree.css';

/*
 * The parts an account tree's page shares (the trial balance, the chart of accounts): its table's rows, its account
 * cell and its controls. The tree's state is useAccountTree's.
 */

// Made once: TableVirtuoso keeps its parts for the table's life (the widths come through its context)
export const ACCOUNT_TREE_TABLE_COMPONENTS = virtualTableComponents(
  // Parent accounts in bold
  (item) => ({ '& td': { fontWeight: item?.hasChildren ? 'bold' : 'normal' } }),
  { '--tree-line-color': 'rgba(0, 0, 0, 0.3)' },
);

/**
 * The account's guide lines (one segment per level), its expand/collapse toggle and its name, which opens the
 * account's statement.
 *
 * @param {object} props.item  a row to show (visibleTreeRows)
 * @param {Function} props.onToggle  expands or collapses an account, by id
 * @param {Function} props.statementLink  an account row's statement: { url, title }
 * @param {Function|null} props.openLink  opens a link as a dashboard window (useOpenLink)
 */
export function AccountTreeCell({ item, onToggle, statementLink, openLink }) {
  const { row } = item;
  const statement = statementLink(row);
  const ancestorSegments = item.ancestorHasNext.slice(1);
  let ownSegment = null;
  if (item.depth > 0) {
    ownSegment = <span className={`tree-guide ${item.isLast ? 'tree-guide-last' : 'tree-guide-branch'}`} />;
  }

  return <div className="tree-account">
    {ancestorSegments.map((runsOn, level) =>
      <span key={`level-${level}`} className={runsOn ? 'tree-guide tree-guide-line' : 'tree-guide'} />)}
    {ownSegment}
    <span className="tree-toggle">
      {item.hasChildren && <IconButton size="small" sx={{ p: 0.25 }} onClick={() => onToggle(row.account_id)}
        aria-label={item.expanded ? 'طي' : 'توسيع'} aria-expanded={item.expanded}>
        {item.expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
      </IconButton>}
    </span>
    <span className="tree-name" title={`كشف حساب ${row.account_name}`}>
      <a href={statement.url} target="_blank" rel="noopener noreferrer"
        onClick={(event) => openLinkOnPlainClick(event, openLink, statement.url, statement.title)}>
        {row.account_name}
      </a>
    </span>
  </div>;
}

/**
 * Expand all, collapse all, and the levels to show, for ReportPageFrame's controls.
 *
 * @param {object} props.tree  what useAccountTree returns
 */
export function AccountTreeControls({ tree }) {
  const { depth, shownLevels, showLevels } = tree;
  return <>
    <Button size="small" sx={{ mt: 1.5 }} disabled={depth === 0}
      onClick={() => showLevels(depth)}>توسيع الكل</Button>
    <Button size="small" sx={{ mt: 1.5 }} disabled={depth === 0}
      onClick={() => showLevels(1)}>طي الكل</Button>
    <TextField select size="small" label="المستويات" value={shownLevels} sx={{ minWidth: 150, mt: 1 }}
      disabled={depth === 0} onChange={(event) => showLevels(Number(event.target.value))}>
      {Array.from({ length: depth }, (unused, index) => index + 1).map((levels) =>
        <MenuItem key={levels} value={levels}>{`حتى المستوى ${levels}`}</MenuItem>)}
    </TextField>
  </>;
}
