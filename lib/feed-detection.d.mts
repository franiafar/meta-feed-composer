export type DetectedFeedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  panelCount: number;
  confidence: "high" | "low";
};

export function detectPanelCount(width: number, height: number): number;

export function detectFeedCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  forcedPanelCount?: number,
): DetectedFeedCrop;
