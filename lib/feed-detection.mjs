const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function detectPanelCount(width, height) {
  return width / height > 1.9 ? 4 : 3;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function backgroundColor(data, width, height) {
  const points = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2], [Math.floor(width / 2), 1]];
  const channels = [[], [], []];
  for (const [x, y] of points) {
    const offset = (y * width + x) * 4;
    channels[0].push(data[offset]);
    channels[1].push(data[offset + 1]);
    channels[2].push(data[offset + 2]);
  }
  return channels.map(median);
}

function differs(data, offset, background) {
  return Math.abs(data[offset] - background[0]) + Math.abs(data[offset + 1] - background[1]) + Math.abs(data[offset + 2] - background[2]) > 62;
}

function isWhite(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return red > 224 && green > 224 && blue > 224 && Math.max(red, green, blue) - Math.min(red, green, blue) < 24;
}

function firstRun(scores, threshold, runLength) {
  let run = 0;
  for (let index = 0; index < scores.length; index += 1) {
    run = scores[index] >= threshold ? run + 1 : 0;
    if (run >= runLength) return index - runLength + 1;
  }
  return -1;
}

function lastRun(scores, threshold, runLength) {
  let run = 0;
  for (let index = scores.length - 1; index >= 0; index -= 1) {
    run = scores[index] >= threshold ? run + 1 : 0;
    if (run >= runLength) return index + runLength - 1;
  }
  return -1;
}

function findVerticalBounds(data, width, height, panelCount, background) {
  const segmentStart = Math.floor(((panelCount - 1) * width) / panelCount);
  const step = Math.max(1, Math.round(width / 520));
  const scores = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    let active = 0;
    let samples = 0;
    for (let x = segmentStart; x < width; x += step) {
      if (differs(data, (y * width + x) * 4, background)) active += 1;
      samples += 1;
    }
    scores[y] = active / samples;
  }
  const first = firstRun(scores, 0.43, 4);
  const last = lastRun(scores, 0.43, 4);
  if (first < 0 || last <= first || last - first < height * 0.52) return null;
  return {
    top: clamp(first - Math.round(height * 0.004), 0, height - 1),
    bottom: clamp(last + Math.round(height * 0.004), first + 1, height - 1),
  };
}

function findHorizontalBounds(data, width, segmentStart, segmentEnd, top, bottom, background) {
  const scores = [];
  const verticalStep = Math.max(1, Math.round((bottom - top) / 420));
  for (let x = segmentStart; x < segmentEnd; x += 1) {
    let active = 0;
    let samples = 0;
    for (let y = top; y <= bottom; y += verticalStep) {
      if (differs(data, (y * width + x) * 4, background)) active += 1;
      samples += 1;
    }
    scores.push(active / samples);
  }
  const first = firstRun(scores, 0.14, 5);
  const last = lastRun(scores, 0.14, 5);
  if (first < 0 || last <= first) return null;
  const padding = Math.round((segmentEnd - segmentStart) * 0.035);
  return {
    left: clamp(segmentStart + first - padding, segmentStart, segmentEnd - 1),
    right: clamp(segmentStart + last + padding, segmentStart + first + 1, segmentEnd - 1),
  };
}

function regionWhiteRatio(data, imageWidth, crop, fromY, toY) {
  const stepX = Math.max(1, Math.round(crop.width / 80));
  const stepY = Math.max(1, Math.round(crop.height / 120));
  let white = 0;
  let samples = 0;
  const top = Math.round(crop.y + crop.height * fromY);
  const bottom = Math.round(crop.y + crop.height * toY);
  for (let y = top; y < bottom; y += stepY) {
    for (let x = crop.x; x < crop.x + crop.width; x += stepX) {
      if (isWhite(data, (y * imageWidth + x) * 4)) white += 1;
      samples += 1;
    }
  }
  return samples ? white / samples : 0;
}

function contentStartRatio(data, imageWidth, crop) {
  const stepX = Math.max(1, Math.round(crop.width / 100));
  const limit = Math.round(crop.height * 0.25);
  const rowScores = [];
  for (let relativeY = 0; relativeY < limit; relativeY += 1) {
    let nonWhite = 0;
    let samples = 0;
    const y = crop.y + relativeY;
    for (let x = crop.x; x < crop.x + crop.width; x += stepX) {
      if (!isWhite(data, (y * imageWidth + x) * 4)) nonWhite += 1;
      samples += 1;
    }
    rowScores.push(nonWhite / samples);
  }
  const start = firstRun(rowScores, 0.58, 3);
  return start < 0 ? 0.25 : start / crop.height;
}

function scoreCandidate(data, imageWidth, crop) {
  const topWhite = regionWhiteRatio(data, imageWidth, crop, 0.01, 0.12);
  const bottomWhite = regionWhiteRatio(data, imageWidth, crop, 0.76, 0.99);
  const imageStart = contentStartRatio(data, imageWidth, crop);
  const startMatch = Math.max(0, 1 - Math.abs(imageStart - 0.095) / 0.12);
  const aspectMatch = Math.max(0, 1 - Math.abs(crop.width / crop.height - 0.52) / 0.22);
  const score = topWhite * 3.2 + bottomWhite * 4.4 + startMatch * 2.2 + aspectMatch * 1.1;
  return { score, topWhite, bottomWhite, imageStart };
}

function candidatesForLayout(data, width, height, panelCount, background) {
  const vertical = findVerticalBounds(data, width, height, panelCount, background);
  if (!vertical) return [];
  const candidates = [];
  for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
    const segmentStart = Math.floor((panelIndex * width) / panelCount);
    const segmentEnd = Math.ceil(((panelIndex + 1) * width) / panelCount);
    const horizontal = findHorizontalBounds(data, width, segmentStart, segmentEnd, vertical.top, vertical.bottom, background);
    if (!horizontal) continue;
    const crop = {
      x: horizontal.left,
      y: vertical.top,
      width: horizontal.right - horizontal.left + 1,
      height: vertical.bottom - vertical.top + 1,
    };
    candidates.push({ ...crop, panelCount, panelIndex, ...scoreCandidate(data, width, crop) });
  }
  return candidates;
}

export function detectFeedCrop(data, width, height) {
  const background = backgroundColor(data, width, height);
  const candidates = [3, 4].flatMap((panelCount) => candidatesForLayout(data, width, height, panelCount, background));
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) {
    return { x: 0, y: 0, width, height, panelCount: 0, panelIndex: -1, confidence: "low", score: 0 };
  }
  return {
    x: best.x,
    y: best.y,
    width: best.width,
    height: best.height,
    panelCount: best.panelCount,
    panelIndex: best.panelIndex,
    confidence: best.score >= 6.2 && best.topWhite >= 0.28 && best.bottomWhite >= 0.3 ? "high" : "low",
    score: best.score,
  };
}
