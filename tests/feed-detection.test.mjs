import assert from "node:assert/strict";
import test from "node:test";
import { detectFeedCrop, detectPanelCount } from "../lib/feed-detection.mjs";

function syntheticScreenshot(panelCount) {
  const width = panelCount === 4 ? 800 : 600;
  const height = 400;
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (left, top, right, bottom, color) => {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }
  };
  paint(0, 0, width, height, [245, 245, 244]);
  const segment = width / panelCount;
  const paintFeed = (panel, imageTop) => {
    const left = Math.round(panel * segment + 14);
    const right = Math.round((panel + 1) * segment - 14);
    paint(left, 50, right, 378, [255, 255, 255]);
    paint(left, imageTop, right, 290, [78, 92, 64]);
    paint(left, 50, right, 52, [176, 176, 176]);
    paint(left, 376, right, 378, [176, 176, 176]);
  };

  if (panelCount === 4) paintFeed(0, 112);
  const instagramFeedPanel = panelCount === 4 ? 1 : 0;
  paintFeed(instagramFeedPanel, 88);
  const firstStoryPanel = panelCount === 4 ? 2 : 1;
  for (let panel = firstStoryPanel; panel < panelCount; panel += 1) {
    paint(panel * segment + 10, 50, (panel + 1) * segment - 10, 378, [64, 78, 85]);
  }
  return { data, width, height, instagramFeedPanel };
}

test("keeps panel-count inference as an internal compatibility helper", () => {
  assert.equal(detectPanelCount(600, 400), 3);
  assert.equal(detectPanelCount(800, 400), 4);
});

for (const panelCount of [3, 4]) {
  test(`selects Instagram Feed automatically in a ${panelCount}-panel screenshot`, () => {
    const source = syntheticScreenshot(panelCount);
    const crop = detectFeedCrop(source.data, source.width, source.height);
    const segment = source.width / panelCount;
    assert.equal(crop.panelCount, panelCount);
    assert.equal(crop.panelIndex, source.instagramFeedPanel);
    assert.equal(crop.confidence, "high");
    assert.ok(crop.x >= source.instagramFeedPanel * segment);
    assert.ok(crop.x + crop.width <= (source.instagramFeedPanel + 1) * segment + 1);
    assert.ok(crop.y <= 55);
    assert.ok(crop.height >= 320);
  });
}

test("does not accept a screenshot that contains only Stories", () => {
  const source = syntheticScreenshot(3);
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const pixelIndex = offset / 4;
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    if (x < source.width / 3 && y >= 50 && y < 378) {
      source.data[offset] = 64;
      source.data[offset + 1] = 78;
      source.data[offset + 2] = 85;
    }
  }
  const crop = detectFeedCrop(source.data, source.width, source.height);
  assert.equal(crop.confidence, "low");
});
