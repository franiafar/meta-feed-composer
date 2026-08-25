import assert from "node:assert/strict";
import test from "node:test";
import { detectFeedCrop, detectPanelCount } from "../lib/feed-detection.mjs";

function syntheticScreenshot(panelCount) {
  const width = panelCount === 4 ? 800 : 600;
  const height = 400;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 245;
    data[offset + 1] = 245;
    data[offset + 2] = 244;
    data[offset + 3] = 255;
  }
  const paint = (left, top, right, bottom, color) => {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
      }
    }
  };
  const segment = width / panelCount;
  const feedPanel = panelCount === 4 ? 1 : 0;
  const feedLeft = feedPanel * segment;
  paint(feedLeft + 16, 92, feedLeft + segment - 16, 320, [78, 92, 64]);
  const storyStart = panelCount === 4 ? 2 : 2;
  for (let panel = storyStart; panel < panelCount; panel += 1) {
    paint(panel * segment + 10, 50, (panel + 1) * segment - 10, 378, [64, 78, 85]);
  }
  return { data, width, height };
}

test("infers three- and four-panel Meta screenshots", () => {
  assert.equal(detectPanelCount(600, 400), 3);
  assert.equal(detectPanelCount(800, 400), 4);
});

for (const panelCount of [3, 4]) {
  test(`detects the Instagram Feed crop in a ${panelCount}-panel screenshot`, () => {
    const source = syntheticScreenshot(panelCount);
    const crop = detectFeedCrop(source.data, source.width, source.height, panelCount);
    const segment = source.width / panelCount;
    const expectedPanel = panelCount === 4 ? 1 : 0;
    assert.equal(crop.panelCount, panelCount);
    assert.equal(crop.confidence, "high");
    assert.ok(crop.x >= expectedPanel * segment);
    assert.ok(crop.x + crop.width <= (expectedPanel + 1) * segment + 1);
    assert.ok(crop.y <= 55);
    assert.ok(crop.height >= 320);
  });
}
