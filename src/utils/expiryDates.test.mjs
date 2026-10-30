import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatExpiry, parseExpiry } from './expiryDates.js';

test('a month and year mean the first day of the month', () => {
  for (const text of ['05/2027', '5/2027', '05-2027', '5.27', '05 27', ' 5/27 ', '٥/٢٠٢٧']) {
    assert.equal(parseExpiry(text), '2027-05-01', text);
  }
  assert.equal(parseExpiry('12/2030'), '2030-12-01');
});

test('a whole date is day, month, year', () => {
  assert.equal(parseExpiry('15/05/2027'), '2027-05-15');
  assert.equal(parseExpiry('1-2-28'), '2028-02-01');
  assert.equal(parseExpiry('٢٩/٠٢/٢٠٢٨'), '2028-02-29', 'Arabic digits, a leap day');
});

test('the year may come first, as the backend sends dates', () => {
  assert.equal(parseExpiry('2027-05-15'), '2027-05-15');
  assert.equal(parseExpiry('2027-05'), '2027-05-01');
});

test('a date that does not exist is refused', () => {
  for (const text of ['31/04/2027', '29/02/2027', '00/05/2027', '13/2027', '0/2027', '32/01/2027', '2027-13']) {
    assert.equal(parseExpiry(text), null, text);
  }
});

test('anything else is refused', () => {
  for (const text of ['', ' ', '2027', '05', 'May 2027', '05/2027/1/1', '1/05/207', '123/2027', '5/2027a', null,
    undefined, '05//', '2027-5-151']) {
    assert.equal(parseExpiry(text), null, String(text));
  }
});

test('a date is shown day first', () => {
  assert.equal(formatExpiry('2027-05-01'), '01/05/2027');
  assert.equal(formatExpiry(null), '');
  assert.equal(formatExpiry(parseExpiry('5/27')), '01/05/2027');
});
