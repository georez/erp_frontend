import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_SEPARATOR as GS, gtinOf, isSeparatorKey, parseDataMatrix, scannedCharacter } from './gs1.js';

const PACK = { gtin: '06221025101853', expiryDate: '2027-05-31', batchNumber: 'LOT42', serialNumber: 'SN0001' };

test('a scan\'s GTIN, expiry, lot and serial, the variable ones ended by the group separator or the end', () => {
  assert.deepEqual(parseDataMatrix(`01062210251018531727053110LOT42${GS}21SN0001`), PACK);
  // Any order; the symbology identifier a scanner may put first
  assert.deepEqual(parseDataMatrix(`]d2010622102510185321SN0001${GS}17270531${GS}10LOT42`), PACK);
});

test('the separator the settings name as a character stands for GS', () => {
  assert.deepEqual(parseDataMatrix('01062210251018531727053110LOT42|21SN0001', '|'), PACK);
});

test('typed by hand, the AIs may be in brackets', () => {
  assert.deepEqual(parseDataMatrix('(01)06221025101853(17)270531(10)LOT42(21)SN0001'), PACK);
});

test('an expiry of day 00 is its month\'s first day, as a month is entered here', () => {
  assert.equal(parseDataMatrix('01062210251018531727050010L1').expiryDate, '2027-05-01');
});

test('AIs of no interest are read past', () => {
  const scanned = `0106221025101853112601011727053110LOT42${GS}714ABC123${GS}21SN0001`;
  assert.deepEqual(parseDataMatrix(scanned), PACK);
});

test('what can\'t be read is an error', () => {
  assert.match(parseDataMatrix('').error, /لا يوجد كود/);
  assert.match(parseDataMatrix('99ABC').error, /رمز تطبيق غير معروف/);
  assert.match(parseDataMatrix('01062210').error, /أقصر من 14/);
  assert.match(parseDataMatrix('010622102510185317271').error, /أقصر من 6/);
  assert.match(parseDataMatrix('010622102510185317271301').error, /الصلاحية/);
  // A missing separator leaves a lot too long to be one
  assert.match(parseDataMatrix('010622102510185310LOT4221SN0001172705310000').error, /فاصل المجموعات/);
  assert.match(parseDataMatrix('17270531').error, /لا يحمل GTIN/);
});

test('a GTIN typed is kept as 14 digits', () => {
  assert.equal(gtinOf('6221025101853'), '06221025101853');
  assert.equal(gtinOf(' 06221025101853 '), '06221025101853');
  assert.equal(gtinOf('12345'), null);
  assert.equal(gtinOf(null), null);
});

const key = (code, keyName, modifiers = {}) => ({
  code, key: keyName, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  getModifierState: () => false, ...modifiers,
});

test('a key press that types a Latin character types it; another types its physical key\'s on a US keyboard', () => {
  assert.equal(scannedCharacter(key('KeyO', 'O'), 'F8'), null, 'as it is');
  assert.equal(scannedCharacter(key('KeyA', 'ش'), 'F8'), 'a');
  assert.equal(scannedCharacter(key('KeyA', 'ِ', { shiftKey: true }), 'F8'), 'A');
  assert.equal(scannedCharacter(key('KeyA', 'ش', { getModifierState: (name) => name === 'CapsLock' }), 'F8'), 'A');
  assert.equal(scannedCharacter(key('Digit7', '٧'), 'F8'), '7');
  assert.equal(scannedCharacter(key('Comma', 'و'), 'F8'), ',');
  assert.equal(scannedCharacter(key('Numpad3', '٣'), 'F8'), '3');
});

test('the separator key, or Ctrl+], types GS; other keys do what they do', () => {
  assert.equal(scannedCharacter(key('F8', 'F8'), 'F8'), GS);
  assert.equal(scannedCharacter(key('F9', 'F9'), 'F8'), null);
  assert.equal(scannedCharacter(key('BracketRight', ']', { ctrlKey: true }), null), GS);
  assert.equal(scannedCharacter(key('KeyV', 'v', { ctrlKey: true }), 'F8'), null, 'a paste');
  assert.equal(scannedCharacter(key('Enter', 'Enter'), 'F8'), null);
  assert.equal(scannedCharacter(key('Backspace', 'Backspace'), 'F8'), null);
});

test('the setting is a key or a character', () => {
  assert.equal(isSeparatorKey('F8'), true);
  assert.equal(isSeparatorKey('F12'), true);
  assert.equal(isSeparatorKey('|'), false);
  assert.equal(isSeparatorKey(null), false);
});
