import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, numberInWords } from './amountInWords.js';

test('numbers up to a thousand', () => {
  assert.equal(numberInWords(1), 'واحد');
  assert.equal(numberInWords(2), 'اثنان');
  assert.equal(numberInWords(10), 'عشرة');
  assert.equal(numberInWords(11), 'أحد عشر');
  assert.equal(numberInWords(12), 'اثنا عشر');
  assert.equal(numberInWords(19), 'تسعة عشر');
  assert.equal(numberInWords(20), 'عشرون');
  assert.equal(numberInWords(21), 'واحد وعشرون');
  assert.equal(numberInWords(99), 'تسعة وتسعون');
  assert.equal(numberInWords(100), 'مائة');
  assert.equal(numberInWords(200), 'مائتان');
  assert.equal(numberInWords(305), 'ثلاثمائة وخمسة');
  assert.equal(numberInWords(999), 'تسعمائة وتسعة وتسعون');
});

test('thousands, millions and billions take the form their count needs', () => {
  assert.equal(numberInWords(1000), 'ألف');
  assert.equal(numberInWords(2000), 'ألفان');
  assert.equal(numberInWords(3000), 'ثلاثة آلاف');
  assert.equal(numberInWords(10000), 'عشرة آلاف');
  assert.equal(numberInWords(11000), 'أحد عشر ألفاً');
  assert.equal(numberInWords(99000), 'تسعة وتسعون ألفاً');
  assert.equal(numberInWords(100000), 'مائة ألف');
  assert.equal(numberInWords(103000), 'مائة وثلاثة آلاف');
  assert.equal(numberInWords(250000), 'مائتان وخمسون ألفاً');
  assert.equal(numberInWords(1235), 'ألف ومائتان وخمسة وثلاثون');
  assert.equal(numberInWords(1000001), 'مليون وواحد');
  assert.equal(numberInWords(2500000), 'مليونان وخمسمائة ألف');
  assert.equal(numberInWords(7000000), 'سبعة ملايين');
  assert.equal(numberInWords(3000000000), 'ثلاثة مليارات');
  assert.equal(numberInWords(999999999999n), 'تسعمائة وتسعة وتسعون ملياراً وتسعمائة وتسعة وتسعون مليوناً '
    + 'وتسعمائة وتسعة وتسعون ألفاً وتسعمائة وتسعة وتسعون');
});

test('an amount is pounds and piasters', () => {
  assert.equal(amountInWords('1235.5'), 'فقط ألف ومائتان وخمسة وثلاثون جنيه مصري وخمسون قرش لا غير');
  assert.equal(amountInWords('502.40'), 'فقط خمسمائة واثنان جنيه مصري وأربعون قرش لا غير');
  assert.equal(amountInWords('320'), 'فقط ثلاثمائة وعشرون جنيه مصري لا غير');
  assert.equal(amountInWords('0.75'), 'فقط خمسة وسبعون قرش لا غير');
  assert.equal(amountInWords('0'), 'فقط صفر جنيه مصري لا غير');
});

test('an amount is rounded half up to piasters', () => {
  assert.equal(amountInWords('12.345'), 'فقط اثنا عشر جنيه مصري وخمسة وثلاثون قرش لا غير');
  assert.equal(amountInWords('9.999'), 'فقط عشرة جنيه مصري لا غير');
});

test('nothing, a negative amount and a trillion are not written out', () => {
  assert.equal(amountInWords(null), '');
  assert.equal(amountInWords(''), '');
  assert.equal(amountInWords('-5'), '-5');
  assert.equal(amountInWords('1000000000000'), '1000000000000');
});
