import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFormField } from './formValidation.js';

test("a form's number isn't negative; a report's may be", () => {
  assert.ok(validateFormField('number', true, '20,2', '12.50'));
  assert.ok(!validateFormField('number', true, '20,2', '-10'), 'a negative public price');
  assert.ok(validateFormField('number', true, '20,2', '-10', { signed: true }));
  assert.ok(!validateFormField('number', true, '5,2', '1234'), 'at most 3 digits before the point');
});

test('a text is trimmed: one of spaces is no value', () => {
  assert.ok(!validateFormField('string', true, '100', '   '), 'a required name of spaces');
  assert.ok(validateFormField('string', false, '50', '   '), 'an optional barcode of spaces is none');
  assert.ok(validateFormField('string', true, '3', ' abc '), 'the spaces around it don\'t count');
});
