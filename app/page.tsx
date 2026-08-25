"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectFeedCrop } from "@/lib/feed-detection.mjs";

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
  panelCount: number;
  panelIndex: number;
  confidence: "high" | "low";
  score: number;
};

type Screenshot = {
  id: string;
  sourceUrl: string;
  thumbnailUrl: string;
  image: HTMLImageElement;
  crop: Crop;
  signature: number[];
};

const TARGET_CARD_HEIGHT = 700;
const TARGET_CARD_WIDTH = 390;
const OUTPUT_GAP = 28;
const OUTPUT_MARGIN = 32;
const DUPLICATE_DISTANCE = 3;

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen pegada."));
    image.src = url;
  });
}

function analyzeImage(image: HTMLImageElement): Crop {
  const scale = Math.min(1, 720 / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Tu navegador no permite analizar imágenes.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const crop = detectFeedCrop(pixels, width, height) as Crop;
  const inverseScale = 1 / scale;
  return {
    ...crop,
    x: Math.round(crop.x * inverseScale),
    y: Math.round(crop.y * inverseScale),
    width: Math.round(crop.width * inverseScale),
    height: Math.round(crop.height * inverseScale),
  };
}

function createSignature(image: HTMLImageElement, crop: Crop) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  const signature = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    signature.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }
  return signature;
}

function signatureDistance(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return Number.POSITIVE_INFINITY;
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0) / left.length;
}

function createThumbnail(image: HTMLImageElement, crop: Crop) {
  const canvas = document.createElement("canvas");
  const height = 300;
  const width = Math.max(1, Math.round((crop.width / crop.height) * height));
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
  return canvas.toDataURL("image/jpeg", 0.86);
}

function drawComposition(canvas: HTMLCanvasElement, screenshots: Screenshot[], title: string) {
  const titleText = title.trim();
  const titleHeight = titleText ? 74 : 0;
  const cardsWidth =
    OUTPUT_MARGIN * 2 +
    TARGET_CARD_WIDTH * screenshots.length +
    OUTPUT_GAP * Math.max(0, screenshots.length - 1);
  const measuringContext = document.createElement("canvas").getContext("2d");
  if (measuringContext) measuringContext.font = "600 30px system-ui, sans-serif";
  const titleWidth = titleText
    ? Math.ceil(measuringContext?.measureText(titleText).width ?? 0) + OUTPUT_MARGIN * 2
    : 0;
  canvas.width = Math.max(cardsWidth, titleWidth);
  canvas.height = OUTPUT_MARGIN * 2 + titleHeight + TARGET_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (titleText) {
    context.fillStyle = "#1c1917";
    context.font = "600 30px system-ui, sans-serif";
    context.textBaseline = "top";
    context.fillText(titleText, OUTPUT_MARGIN, OUTPUT_MARGIN + 2);
  }
  let x = OUTPUT_MARGIN;
  const y = OUTPUT_MARGIN + titleHeight;
  screenshots.forEach((item) => {
    context.drawImage(
      item.image,
      item.crop.x,
      item.crop.y,
      item.crop.width,
      item.crop.height,
      x,
      y,
      TARGET_CARD_WIDTH,
      TARGET_CARD_HEIGHT,
    );
    x += TARGET_CARD_WIDTH + OUTPUT_GAP;
  });
}

export default function Home() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Esperando imágenes");
  const [error, setError] = useState("");
  const outputCanvas = useRef<HTMLCanvasElement>(null);
  const screenshotsRef = useRef<Screenshot[]>([]);

  const addBlobs = useCallback(async (blobs: Blob[]) => {
    if (!blobs.length) return;
    setError("");
    setStatus("Analizando…");
    try {
      const results = await Promise.allSettled(
        blobs.map(async (blob) => {
          const sourceUrl = URL.createObjectURL(blob);
          try {
            const image = await loadImage(sourceUrl);
            const crop = analyzeImage(image);
            if (crop.confidence !== "high") {
              URL.revokeObjectURL(sourceUrl);
              return null;
            }
            return {
              id: makeId(),
              sourceUrl,
              thumbnailUrl: createThumbnail(image, crop),
              image,
              crop,
              signature: createSignature(image, crop),
            } satisfies Screenshot;
          } catch (cause) {
            URL.revokeObjectURL(sourceUrl);
            throw cause;
          }
        }),
      );
      const processed = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const detected = processed.filter((item): item is Screenshot => item !== null);
      const unreadable = results.filter((result) => result.status === "rejected").length;
      if (unreadable) setError(`${unreadable} imagen${unreadable === 1 ? " no se pudo leer" : "es no se pudieron leer"}.`);
      setScreenshots((current) => {
        const unique: Screenshot[] = [];
        for (const item of detected) {
          const duplicate = [...current, ...unique].some(
            (existing) => signatureDistance(existing.signature, item.signature) <= DUPLICATE_DISTANCE,
          );
          if (duplicate) URL.revokeObjectURL(item.sourceUrl);
          else unique.push(item);
        }
        const discarded = blobs.length - unique.length;
        queueMicrotask(() => {
          if (unique.length) {
            setStatus(`${unique.length} Feed${unique.length === 1 ? "" : "s"} agregado${unique.length === 1 ? "" : "s"}${discarded ? ` · ${discarded} imagen${discarded === 1 ? "" : "es"} descartada${discarded === 1 ? "" : "s"}` : ""}`);
          } else {
            setStatus("No encontré un Instagram Feed nuevo");
          }
        });
        return [...current, ...unique];
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron procesar las imágenes.");
      setStatus("Revisá las imágenes pegadas");
    }
  }, []);

  useEffect(() => {
    screenshotsRef.current = screenshots;
  }, [screenshots]);

  useEffect(() => () => {
    screenshotsRef.current.forEach((item) => URL.revokeObjectURL(item.sourceUrl));
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const blobs = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (blobs.length) {
        event.preventDefault();
        void addBlobs(blobs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addBlobs]);

  useEffect(() => {
    if (screenshots.length && outputCanvas.current) {
      drawComposition(outputCanvas.current, screenshots, title);
    }
  }, [screenshots, title]);

  const removeScreenshot = (id: string) => {
    setScreenshots((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.sourceUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const moveScreenshot = (index: number, direction: -1 | 1) => {
    setScreenshots((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const clearAll = () => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.sourceUrl));
    setScreenshots([]);
    setStatus("Esperando imágenes");
    setError("");
  };

  const download = () => {
    const canvas = outputCanvas.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "instagram-feeds.png";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <strong>Meta Feed Composer</strong>
          <span>Pegá screenshots de Meta y exportá los Feeds en una fila.</span>
        </div>
        <span className="privacy-note">Las imágenes no salen de tu navegador</span>
      </header>

      <section className="workspace">
        <aside className="controls" aria-label="Configuración">
          <label>
            Título opcional
            <input
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej. Back to School"
              type="text"
              value={title}
            />
          </label>
          <div className="format-note">
            <strong>Formato de salida</strong>
            <span>Instagram Feed · una fila horizontal · PNG</span>
          </div>
          <div className="actions">
            <button className="primary-button" disabled={!screenshots.length} onClick={download}>
              Descargar PNG
            </button>
            <button className="text-button" disabled={!screenshots.length} onClick={clearAll}>
              Limpiar todo
            </button>
          </div>
        </aside>

        <div className="stage">
          <div
            aria-label="Zona para pegar screenshots"
            className="paste-zone"
          >
            <div className="paste-key">⌘V</div>
            <strong>Pegá tus screenshots acá</strong>
            <p>Pegalos como estén. La herramienta encuentra el Instagram Feed y descarta Stories y duplicados.</p>
            <span className="paste-status">{status}</span>
            {error && <span className="error-message">{error}</span>}
          </div>

          {screenshots.length > 0 && (
            <section className="source-panel" aria-label="Feeds detectados">
              <div className="panel-heading">
                <strong>Feeds detectados</strong>
                <span>{screenshots.length} creativo{screenshots.length === 1 ? "" : "s"}</span>
              </div>
              <div className="source-list">
                {screenshots.map((item, index) => (
                  <article className="source-card" key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Feed detectado ${index + 1}`} src={item.thumbnailUrl} />
                    <div className="source-meta">
                      <strong>Feed {index + 1}</strong>
                      <span className="confidence">Instagram Feed detectado</span>
                    </div>
                    <div className="item-actions">
                      <button disabled={index === 0} onClick={() => moveScreenshot(index, -1)} aria-label="Mover a la izquierda">←</button>
                      <button disabled={index === screenshots.length - 1} onClick={() => moveScreenshot(index, 1)} aria-label="Mover a la derecha">→</button>
                      <button onClick={() => removeScreenshot(item.id)}>Quitar</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="preview-panel" aria-label="Vista previa">
            <div className="panel-heading">
              <strong>Vista previa</strong>
              <span>{screenshots.length ? "Salida horizontal" : "Pegá al menos un screenshot"}</span>
            </div>
            {screenshots.length ? (
              <div className="canvas-wrap">
                <canvas ref={outputCanvas} />
              </div>
            ) : (
              <div className="empty-canvas" />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
