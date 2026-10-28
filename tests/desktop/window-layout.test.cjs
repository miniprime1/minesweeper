'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {MIN_ZOOM, MAX_ZOOM, clampZoom, fitLayout, zoomFromBounds} = require('../../electron/window-layout.cjs');

const roomyDisplay = {width: 4096, height: 4096};
const presets = {
  beginner: {width: 170, height: 251},
  intermediate: {width: 282, height: 363},
  expert: {width: 506, height: 363}
};

test('zoom is bounded and invalid requests return the original size', () => {
  assert.equal(MIN_ZOOM, 0.75);
  assert.equal(MAX_ZOOM, 4);
  assert.equal(clampZoom(0.25), 0.75);
  assert.equal(clampZoom(8), 4);
  assert.equal(clampZoom(1.375), 1.375);
  for (const value of [undefined, null, '2', NaN, Infinity, -Infinity]) assert.equal(clampZoom(value), 1);
});

for (const [name, extent] of Object.entries(presets)) {
  test(`${name} preserves whole-game proportions at each supported zoom`, () => {
    for (const zoom of [0.75, 1, 2, 4]) {
      const layout = fitLayout(extent, zoom, roomyDisplay);
      assert.equal(layout.zoom, zoom);
      assert.equal(layout.width, Math.round(extent.width * zoom));
      assert.equal(layout.height, Math.round(extent.height * zoom));
      assert.equal(layout.minWidth, Math.round(extent.width * MIN_ZOOM));
      assert.equal(layout.minHeight, Math.round(extent.height * MIN_ZOOM));
      assert.equal(layout.maxWidth, extent.width * MAX_ZOOM);
      assert.equal(layout.maxHeight, extent.height * MAX_ZOOM);
    }
  });
}

test('expert can reach four times original size on a large display', () => {
  const layout = fitLayout(presets.expert, 4, roomyDisplay);
  assert.equal(layout.width, 2024);
  assert.equal(layout.height, 1452);
});

test('a display limit reduces both dimensions with one uniform zoom', () => {
  const extent = presets.expert, workArea = {width: 1280, height: 800};
  const layout = fitLayout(extent, 4, workArea);
  assert.equal(layout.zoom, 800 / 363);
  assert.equal(layout.width, Math.round(506 * 800 / 363));
  assert.equal(layout.height, 800);
  assert.equal(layout.maxWidth, layout.width);
  assert.equal(layout.maxHeight, layout.height);
  assert.ok(layout.width <= workArea.width);
  assert.ok(layout.height <= workArea.height);
  assert.ok(Math.abs(layout.width / extent.width - layout.height / extent.height) <= 0.5 / extent.width);
});

test('a narrow display clamps width without independently stretching height', () => {
  const layout = fitLayout(presets.expert, 4, {width: 900, height: 1200});
  assert.equal(layout.zoom, 900 / 506);
  assert.equal(layout.width, 900);
  assert.equal(layout.height, Math.round(363 * 900 / 506));
});

test('tiny work areas may reduce below the normal minimum so the game fits', () => {
  const layout = fitLayout(presets.intermediate, 1, {width: 100, height: 100});
  assert.equal(layout.zoom, 100 / 363);
  assert.equal(layout.width, 78);
  assert.equal(layout.height, 100);
  assert.equal(layout.minWidth, layout.width);
  assert.equal(layout.minHeight, layout.height);
  assert.equal(layout.maxWidth, layout.width);
  assert.equal(layout.maxHeight, layout.height);
});

test('native bounds derive scale from the limiting dimension and clamp it', () => {
  assert.equal(zoomFromBounds({width: 564, height: 726}, presets.intermediate), 2);
  assert.equal(zoomFromBounds({width: 600, height: 726}, presets.intermediate), 2);
  assert.equal(zoomFromBounds({width: 564, height: 800}, presets.intermediate), 2);
  assert.equal(zoomFromBounds({width: 100, height: 100}, presets.intermediate), 0.75);
  assert.equal(zoomFromBounds({width: 4000, height: 4000}, presets.intermediate), 4);
});

test('invalid geometry cannot reach native size APIs', () => {
  for (const value of [null, {}, {width: 0, height: 10}, {width: 10, height: Infinity}, {width: -1, height: 10}]) {
    assert.throws(() => fitLayout(value, 1, roomyDisplay), RangeError);
    assert.throws(() => fitLayout(presets.beginner, 1, value), RangeError);
    assert.throws(() => zoomFromBounds(value, presets.beginner), RangeError);
  }
});
