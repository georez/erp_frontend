import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Big } from 'bigdecimal.js';
import {
  formatDecimal, normalizeDecimalText, parseDecimal, parsePercent, parseWholeUnits,
  formatAmount, formatExactAmount,
} from './decimals.js';

test('exact amounts: every decimal they have, at least two', () => {
  assert.equal(formatExactAmount('1652.9135000'), '1,652.9135');
  assert.equal(formatExactAmount('850'), '850.00');
  assert.equal(formatExactAmount('61900.5000000'), '61,900.50');
  assert.equal(formatExactAmount('0.0036000'), '0.0036');
  assert.equal(formatExactAmount('9739.4610015'), '9,739.4610015');
  assert.equal(formatExactAmount('-1234567.1'), '-1,234,567.10');
});

test('parses plain decimal text, and nothing else', () => {
  assert.equal(parseDecimal(' 12.50 ').toPlainString(), '12.50');
  assert.equal(parseDecimal('-3').toPlainString(), '-3');
  for (const text of ['', ' ', 'abc', '1e5', '1.', '.5', '--1', '1.2.3', null, undefined]) {
    assert.equal(parseDecimal(text), null, String(text));
  }
});

test('accepts Arabic digits and separators', () => {
  assert.equal(normalizeDecimalText('١٢٫٥'), '12.5');
  assert.equal(normalizeDecimalText('۱۲۳'), '123');
  assert.equal(parseDecimal('1,5'), null, 'not 15: the comma may be a decimal separator');
  assert.equal(parseDecimal('٠٫١').toPlainString(), '0.1');
});

test('formats without trailing zeros, with thousands separators', () => {
  assert.equal(formatDecimal(Big('1234567.5000000')), '1,234,567.5');
  assert.equal(formatDecimal(Big('-1234')), '-1,234');
  assert.equal(formatDecimal(Big('0.0000000')), '0');
  assert.equal(formatDecimal(Big('1E+3')), '1,000');
});

test('amounts: two decimals, rounded half up, with thousands separators', () => {
  assert.equal(formatAmount('1234.565'), '1,234.57');
  assert.equal(formatAmount('116868.87'), '116,868.87');
  assert.equal(formatAmount('7'), '7.00');
  assert.equal(formatAmount(7), '7.00', 'a JSON number');
  assert.equal(formatAmount('0.004'), '0.00');
  assert.equal(formatAmount('-1234567.5'), '-1,234,567.50');
  assert.equal(formatAmount('12345678901234567890.1234567'), '12,345,678,901,234,567,890.12', 'exact, no lost digits');
  assert.equal(formatAmount(null), '');
  assert.equal(formatAmount(''), '');
  assert.equal(formatAmount('n/a'), 'n/a');
});

test('whole units: digits only, no fraction, no sign', () => {
  assert.equal(parseWholeUnits(' 12 '), '12');
  assert.equal(parseWholeUnits('٣'), '3');
  assert.equal(parseWholeUnits('007'), '7');
  assert.equal(parseWholeUnits('0'), '0');
  assert.equal(parseWholeUnits('999999999999999999'), '999999999999999999', 'more digits than a JavaScript number holds');
  for (const text of ['2.5', '3.0', '-1', '', 'abc', '1e3', '1,000', '1000000000000000000']) {
    assert.equal(parseWholeUnits(text), null, text);
  }
});

test('a percent is 0 to 100 with up to 3 decimals', () => {
  assert.equal(parsePercent('12.345').toPlainString(), '12.345');
  assert.equal(parsePercent('100').toPlainString(), '100');
  assert.equal(parsePercent('0').toPlainString(), '0');
  assert.equal(parsePercent('٢٥٫٥').toPlainString(), '25.5');
  assert.equal(parsePercent('12.3450000').toPlainString(), '12.3450000', 'trailing zeros do not count');
  for (const text of ['-1', '100.001', '1.1234', '', 'abc']) {
    assert.equal(parsePercent(text), null, text);
  }
});
