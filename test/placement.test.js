import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLAPSED_WIDTH, PANEL_GAP, placePanel, rectsOverlap } from '../src/lib/placement.js';

const viewport = { width: 1280, height: 800 };

function boxOf(placed) {
  const edge = viewport.width - placed.right;
  return {
    top: placed.top,
    left: edge - placed.width,
    right: edge,
    bottom: placed.top + placed.height,
  };
}

test('sits immediately left of 创作 and leaves the drafts control alone', () => {
  const create = { top: 80, left: 1100, right: 1220, bottom: 116, width: 120, height: 36 };
  const drafts = { top: 80, left: 40, right: 120, bottom: 116, width: 80, height: 36 };
  const placed = placePanel({ mode: 'collapsed', viewport, anchor: create, obstacles: [drafts] });
  const box = boxOf(placed);

  assert.equal(box.right, create.left - PANEL_GAP);
  assert.equal(box.top, create.top);
  assert.equal(placed.width, COLLAPSED_WIDTH);
  assert.equal(rectsOverlap(box, create), false);
  assert.equal(rectsOverlap(box, drafts), false);
});

test('slides left past a neighbor instead of covering it or 创作', () => {
  const create = { top: 70, left: 780, right: 880, bottom: 106, width: 100, height: 36 };
  const history = { top: 70, left: 640, right: 760, bottom: 106, width: 120, height: 36 };
  const narrow = { width: 900, height: 800 };
  const placed = placePanel({
    mode: 'collapsed',
    viewport: narrow,
    anchor: create,
    obstacles: [history],
  });
  const edge = narrow.width - placed.right;
  const box = { top: placed.top, left: edge - placed.width, right: edge, bottom: placed.top + placed.height };

  assert.equal(rectsOverlap(box, create), false);
  assert.equal(rectsOverlap(box, history), false);
  assert.ok(box.right <= history.left - PANEL_GAP);
});

test('opens the panel under the button row so 创作 stays visible', () => {
  const create = { top: 80, left: 1100, right: 1220, bottom: 116, width: 120, height: 36 };
  const placed = placePanel({ mode: 'expanded', viewport, anchor: create, obstacles: [] });
  const box = boxOf(placed);

  assert.ok(box.top >= create.bottom + PANEL_GAP);
  assert.ok(box.right <= create.left - PANEL_GAP);
  assert.equal(rectsOverlap(box, create), false);
});

test('on the editor, sits left of the preview and publish cluster', () => {
  const preview = { top: 20, left: 900, right: 980, bottom: 56, width: 80, height: 36 };
  const publish = { top: 20, left: 1100, right: 1220, bottom: 56, width: 120, height: 36 };
  const placed = placePanel({ mode: 'collapsed', viewport, anchor: null, obstacles: [preview, publish] });
  const box = boxOf(placed);

  assert.equal(rectsOverlap(box, preview), false);
  assert.equal(rectsOverlap(box, publish), false);
  assert.ok(box.right <= preview.left - PANEL_GAP);
});

test('without a toolbar anchor, stays off the top-right corner', () => {
  const placed = placePanel({ mode: 'collapsed', viewport, anchor: null, obstacles: [] });
  assert.ok(placed.top > 80);
  assert.equal(placed.right, 24);
});
