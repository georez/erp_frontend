import { Big } from 'bigdecimal.js';
import { formatAmount } from './decimals.js';

/*
 * A statement's rows (accountStatementReport, supplierStatementReport): first the opening row, then the period's lines,
 * each with the balance after it. A balance is debit minus credit: positive on the debit side, negative on the credit
 * side.
 */

/** A decimal cell (text, or a JSON number for small integers) as a BigDecimal; an empty one as zero. */
function decimalOf(value) {
  return value === null || value === undefined || value === '' ? Big(0) : Big(String(value));
}

/**
 * The statement's summary: the opening balance, the period's debits and credits added up exactly, and the closing
 * balance (the last row's), all as plain decimal text.
 *
 * @param {Array<{debit?: string, credit?: string, balance: string}>} rows  the opening row first
 * @returns {{opening: string, debit: string, credit: string, closing: string}|null} null without rows
 */
export function statementSummary(rows) {
  if (rows.length === 0) {
    return null;
  }
  let debit = Big(0);
  let credit = Big(0);
  for (const row of rows.slice(1)) {
    debit = debit.add(decimalOf(row.debit));
    credit = credit.add(decimalOf(row.credit));
  }
  const plain = (value) => value.stripTrailingZeros().toPlainString();
  return {
    opening: plain(decimalOf(rows[0].balance)),
    debit: plain(debit),
    credit: plain(credit),
    closing: plain(decimalOf(rows[rows.length - 1].balance)),
  };
}

/**
 * A balance in two columns: its amount under debit when it's positive, under credit when it's negative; both empty for
 * zero.
 *
 * @param {string|number} value  debit minus credit
 * @returns {{debit: string, credit: string}}
 */
export function balanceColumns(value) {
  const balance = decimalOf(value);
  const amount = formatAmount(balance.abs().toPlainString());
  return {
    debit: balance.signum() > 0 ? amount : '',
    credit: balance.signum() < 0 ? amount : '',
  };
}
