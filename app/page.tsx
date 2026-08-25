"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectFeedCrop, detectPanelCount } from "@/lib/feed-detection.mjs";

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
  panelCount: number;
  confidence: "high" | "low";
};

type Screenshot = {
  id: string;
  sourceUrl: string;
  thumbnailUrl: string;
  image: HTMLImageElement;
  crop: Crop;
  panelCount: number;
};

const TARGET_CARD_HEIGHT = 700;
const OUTPUT_GAP = 28;
const OUTPUT_MARGIN = 32;

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

function analyzeImage(image: HTMLImageElement, forcedPanelCount?: number): Crop {
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
  const crop = detectFeedCrop(pixels, width, height, forcedPanelCount) as Crop;
  const inverseScale = 1 / scale;
  return {
    ...crop,
    x: Math.round(crop.x * inverseScale),
    y: Math.round(crop.y * inverseScale),
    width: Math.round(crop.width * inverseScale),
    height: Math.round(crop.height * inverseScale),
  };
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
  const widths = screenshots.map((item) =>
    Math.max(1, Math.round((item.crop.width / item.crop.height) * TARGET_CARD_HEIGHT)),
  );
  const cardsWidth =
    OUTPUT_MARGIN * 2 +
    widths.reduce((total, width) => total + width, 0) +
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
  screenshots.forEach((item, index) => {
    context.drawImage(
      item.image,
      item.crop.x,
      item.crop.y,
      item.crop.width,
      item.crop.height,
      x,
      y,
      widths[index],
      TARGET_CARD_HEIGHT,
    );
    x += widths[index] + OUTPUT_GAP;
  });
}

export default function Home() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Esperando imágenes");
  const [error, setError] = useState("");
  const outputCanvas = useRef<HTMLCanvasElement>(null);

  const addBlobs = useCallback(async (blobs: Blob[]) => {
    if (!blobs.length) return;
    setError("");
    setStatus("Analizando…");
    try {
      const added = await Promise.all(
        blobs.map(async (blob) => {
          const sourceUrl = URL.createObjectURL(blob);
          try {
            const image = await loadImage(sourceUrl);
            const panelCount = detectPanelCount(image.naturalWidth, image.naturalHeight);
            const crop = analyzeImage(image, panelCount);
            return {
              id: makeId(),
              sourceUrl,
              thumbnailUrl: createThumbnail(image, crop),
              image,
              crop,
              panelCount,
            } satisfies Screenshot;
          } catch (cause) {
            URL.revokeObjectURL(sourceUrl);
            throw cause;
          }
        }),
      );
      setScreenshots((current) => [...current, ...added]);
      setStatus(`${added.length} Feed${added.length === 1 ? "" : "s"} agregado${added.length === 1 ? "" : "s"}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron procesar las imágenes.");
      setStatus("Revisá las imágenes pegadas");
    }
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

  const setPanelCount = (id: string, panelCount: number) => {
    setScreenshots((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const crop = analyzeImage(item.image, panelCount);
        return {
          ...item,
          panelCount,
          crop,
          thumbnailUrl: createThumbnail(item.image, crop),
        };
      }),
    );
  };

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
            <p>Copialos desde Meta. Podés pegarlos de a uno o varios juntos.</p>
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
                      <label>
                        Captura
                        <select
                          aria-label={`Cantidad de paneles de la captura ${index + 1}`}
                          onChange={(event) => setPanelCount(item.id, Number(event.target.value))}
                          value={item.panelCount}
                        >
                          <option value={3}>3 paneles</option>
                          <option value={4}>4 paneles</option>
                        </select>
                      </label>
                      <span className={item.crop.confidence === "high" ? "confidence" : "confidence warning"}>
                        {item.crop.confidence === "high" ? "Recorte automático" : "Revisar recorte"}
                      </span>
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
