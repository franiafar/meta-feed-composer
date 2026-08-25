export type DetectedFeedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  panelCount: number;
  panelIndex: number;
  confidence: "high" | "low";
  score: number;
};

export function detectPanelCount(width: number, height: number): number;

export function detectFeedCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedFeedCrop;
