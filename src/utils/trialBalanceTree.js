/*
 * The trial balance's account tree: the rows of trialBalanceReport (one per account, each right after its parent,
 * in sort_path order) as a tree, and the rows to show for the accounts that are expanded.
 */

/**
 * The sort_path of an account's parent, or null for a root. A sort_path is the account's ids from its root down,
 * joined with "/" (see the report's query.sql).
 */
function parentPathOf(sortPath) {
  const separator = sortPath.lastIndexOf('/');
  return separator < 0 ? null : sortPath.slice(0, separator);
}

/**
 * The accounts as a tree. An account whose parent isn't among the rows is taken as a root.
 *
 * @param {Array<{account_id: string, sort_path: string}>} rows  in sort_path order
 * @returns {Array<{row: object, children: Array}>} the roots, each with its children, in the rows' order
 */
export function buildAccountTree(rows) {
  const nodesByPath = new Map();
  const roots = [];
  for (const row of rows) {
    const node = { row, children: [] };
    nodesByPath.set(row.sort_path, node);
    const parent = nodesByPath.get(parentPathOf(row.sort_path));
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * The ids of the accounts that have children, down to a depth: expanding them shows the tree down to that depth.
 *
 * @param {Array<{row: object, children: Array}>} roots
 * @param {number} [belowDepth]  only accounts at a smaller depth (roots are at depth 0); all of them when missing
 * @returns {Set<string>}
 */
export function parentAccountIds(roots, belowDepth = Infinity) {
  const ids = new Set();
  const visit = (nodes, depth) => {
    for (const node of nodes) {
      if (node.children.length > 0 && depth < belowDepth) {
        ids.add(node.row.account_id);
        visit(node.children, depth + 1);
      }
    }
  };
  visit(roots, 0);
  return ids;
}

/** How deep the tree goes: 1 for roots only. */
export function treeDepth(roots) {
  let depth = 0;
  const visit = (nodes, level) => {
    for (const node of nodes) {
      depth = Math.max(depth, level + 1);
      visit(node.children, level + 1);
    }
  };
  visit(roots, 0);
  return depth;
}

/**
 * The rows to show, top to bottom: the roots, and under each expanded account its children, depth first.
 *
 * Each item carries what the account column draws:
 * - depth: 0 for a root
 * - hasChildren, expanded
 * - isLast: the account is its parent's last child (its guide line ends here: └ rather than ├)
 * - ancestorHasNext: for each ancestor depth, whether that ancestor has a sibling after it, so the guide line of that
 *   depth runs on past this row (│) or not
 *
 * @param {Array<{row: object, children: Array}>} roots
 * @param {Set<string>} expandedIds
 * @returns {Array<{row: object, depth: number, hasChildren: boolean, expanded: boolean, isLast: boolean,
 *   ancestorHasNext: boolean[]}>}
 */
export function visibleTreeRows(roots, expandedIds) {
  const items = [];
  const visit = (nodes, depth, ancestorHasNext) => {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && expandedIds.has(node.row.account_id);
      items.push({ row: node.row, depth, hasChildren, expanded, isLast, ancestorHasNext });
      if (expanded) {
        visit(node.children, depth + 1, [...ancestorHasNext, !isLast]);
      }
    });
  };
  visit(roots, 0, []);
  return items;
}
