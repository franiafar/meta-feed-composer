const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function detectPanelCount(width, height) {
  return width / height > 1.9 ? 4 : 3;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function backgroundColor(data, width, height) {
  const points = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2],
    [Math.floor(width / 2), 1],
  ];
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
  return (
    Math.abs(data[offset] - background[0]) +
      Math.abs(data[offset + 1] - background[1]) +
      Math.abs(data[offset + 2] - background[2]) >
    62
  );
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

function fallbackCrop(width, height, panelCount) {
  const fourPanel = panelCount === 4;
  return {
    x: Math.round(width * (fourPanel ? 0.257 : 0.016)),
    y: Math.round(height * 0.11),
    width: Math.round(width * (fourPanel ? 0.239 : 0.312)),
    height: Math.round(height * 0.85),
  };
}

export function detectFeedCrop(data, width, height, forcedPanelCount) {
  const panelCount = forcedPanelCount ?? detectPanelCount(width, height);
  const fallback = fallbackCrop(width, height, panelCount);
  const background = backgroundColor(data, width, height);
  const sampleStep = Math.max(1, Math.round(width / 520));
  const rowScores = new Array(height).fill(0);
  const storySegmentStart = Math.floor(((panelCount - 1) * width) / panelCount);

  for (let y = 0; y < height; y += 1) {
    let active = 0;
    let samples = 0;
    for (let x = storySegmentStart; x < width; x += sampleStep) {
      if (differs(data, (y * width + x) * 4, background)) active += 1;
      samples += 1;
    }
    rowScores[y] = active / samples;
  }

  let top = firstRun(rowScores, 0.46, 4);
  let bottom = lastRun(rowScores, 0.46, 4);
  if (top < 0 || bottom <= top || bottom - top < height * 0.55) {
    return { ...fallback, panelCount, confidence: "low" };
  }

  top = clamp(top - Math.round(height * 0.004), 0, height - 1);
  bottom = clamp(bottom + Math.round(height * 0.004), top + 1, height - 1);

  const targetPanel = panelCount === 4 ? 1 : 0;
  const segmentStart = Math.floor((targetPanel * width) / panelCount);
  const segmentEnd = Math.ceil(((targetPanel + 1) * width) / panelCount);
  const xScores = [];
  const verticalStep = Math.max(1, Math.round((bottom - top) / 420));

  for (let x = segmentStart; x < segmentEnd; x += 1) {
    let active = 0;
    let samples = 0;
    for (let y = top; y <= bottom; y += verticalStep) {
      if (differs(data, (y * width + x) * 4, background)) active += 1;
      samples += 1;
    }
    xScores.push(active / samples);
  }

  const leftIndex = firstRun(xScores, 0.16, 5);
  const rightIndex = lastRun(xScores, 0.16, 5);
  if (leftIndex < 0 || rightIndex <= leftIndex) {
    return {
      ...fallback,
      y: top,
      height: bottom - top + 1,
      panelCount,
      confidence: "low",
    };
  }

  const padding = Math.round((segmentEnd - segmentStart) * 0.035);
  const left = clamp(segmentStart + leftIndex - padding, segmentStart, segmentEnd - 1);
  const right = clamp(segmentStart + rightIndex + padding, left + 1, segmentEnd - 1);

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    panelCount,
    confidence: "high",
  };
}
