import assert from 'node:assert/strict';
import test from 'node:test';
import { isImagePostSearch, pickBodyMirrorIndex } from '../src/lib/editor-body.js';

test('detects image post editor URLs', () => {
  assert.equal(isImagePostSearch('?createType=8&token=1'), true);
  assert.equal(isImagePostSearch('?type=10&createType=8'), true);
  assert.equal(isImagePostSearch('?createType=80'), false);
});

test('image post prefers the largest body mirror', () => {
  const areas = [100, 400, 200];
  assert.equal(pickBodyMirrorIndex(areas, { imagePost: true }), 1);
});

test('article post keeps the second mirror in document order', () => {
  const areas = [400, 100, 200];
  assert.equal(pickBodyMirrorIndex(areas, { imagePost: false, documentOrder: [0, 1, 2] }), 1);
});
