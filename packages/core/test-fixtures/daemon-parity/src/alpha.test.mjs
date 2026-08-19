import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from './alpha.mjs';

test('greeting is stable', () => {
  assert.equal(greeting(), 'hello-alpha');
});
