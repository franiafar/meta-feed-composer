"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

type Language = "en" | "es";

type Status =
  | { kind: "waiting" }
  | { kind: "analyzing" }
  | { kind: "added"; added: number; discarded: number }
  | { kind: "notFound" }
  | { kind: "review" };

type ErrorState =
  | { kind: "unreadable"; count: number }
  | { kind: "processing" }
  | null;

const LANGUAGE_STORAGE_KEY = "meta-feed-composer-language";
const LANGUAGE_CHANGE_EVENT = "meta-feed-composer-language-change";

const COPY = {
  en: {
    tagline: "Paste Meta screenshots and export the Feeds in one row.",
    privacy: "Images never leave your browser",
    settingsLabel: "Settings",
    optionalTitle: "Optional title",
    titlePlaceholder: "E.g. Back to School",
    outputFormat: "Output format",
    outputDescription: "Instagram Feed · one horizontal row · PNG",
    download: "Download PNG",
    clear: "Clear all",
    pasteArea: "Screenshot paste area",
    pasteHeading: "Paste your screenshots here",
    pasteHint: "Paste them as they are. The tool finds the Instagram Feed and removes Stories and duplicates.",
    detectedFeeds: "Detected Feeds",
    detectedFeed: "Instagram Feed detected",
    preview: "Preview",
    horizontalOutput: "Horizontal output",
    pasteAtLeastOne: "Paste at least one screenshot",
    moveLeft: "Move left",
    moveRight: "Move right",
    remove: "Remove",
    languageSelector: "Language",
    statusWaiting: "Waiting for images",
    statusAnalyzing: "Analyzing…",
    statusNotFound: "No new Instagram Feed found",
    statusReview: "Check the pasted images",
    errorProcessing: "The images could not be processed.",
  },
  es: {
    tagline: "Pegá screenshots de Meta y exportá los Feeds en una fila.",
    privacy: "Las imágenes no salen de tu navegador",
    settingsLabel: "Configuración",
    optionalTitle: "Título opcional",
    titlePlaceholder: "Ej. Back to School",
    outputFormat: "Formato de salida",
    outputDescription: "Instagram Feed · una fila horizontal · PNG",
    download: "Descargar PNG",
    clear: "Limpiar todo",
    pasteArea: "Zona para pegar screenshots",
    pasteHeading: "Pegá tus screenshots acá",
    pasteHint: "Pegalos como estén. La herramienta encuentra el Instagram Feed y descarta Stories y duplicados.",
    detectedFeeds: "Feeds detectados",
    detectedFeed: "Instagram Feed detectado",
    preview: "Vista previa",
    horizontalOutput: "Salida horizontal",
    pasteAtLeastOne: "Pegá al menos un screenshot",
    moveLeft: "Mover a la izquierda",
    moveRight: "Mover a la derecha",
    remove: "Quitar",
    languageSelector: "Idioma",
    statusWaiting: "Esperando imágenes",
    statusAnalyzing: "Analizando…",
    statusNotFound: "No encontré un Instagram Feed nuevo",
    statusReview: "Revisá las imágenes pegadas",
    errorProcessing: "No se pudieron procesar las imágenes.",
  },
} as const;

function getStatusText(language: Language, status: Status) {
  const copy = COPY[language];
  if (status.kind === "waiting") return copy.statusWaiting;
  if (status.kind === "analyzing") return copy.statusAnalyzing;
  if (status.kind === "notFound") return copy.statusNotFound;
  if (status.kind === "review") return copy.statusReview;
  if (language === "en") {
    const added = `${status.added} Feed${status.added === 1 ? "" : "s"} added`;
    const discarded = status.discarded
      ? ` · ${status.discarded} image${status.discarded === 1 ? "" : "s"} discarded`
      : "";
    return added + discarded;
  }
  const added = `${status.added} Feed${status.added === 1 ? "" : "s"} agregado${status.added === 1 ? "" : "s"}`;
  const discarded = status.discarded
    ? ` · ${status.discarded} ${status.discarded === 1 ? "imagen descartada" : "imágenes descartadas"}`
    : "";
  return added + discarded;
}

function getErrorText(language: Language, error: ErrorState) {
  if (!error) return "";
  if (error.kind === "processing") return COPY[language].errorProcessing;
  if (language === "en") {
    return `${error.count} image${error.count === 1 ? "" : "s"} could not be read.`;
  }
  return `${error.count} imagen${error.count === 1 ? " no se pudo leer" : "es no se pudieron leer"}.`;
}

function getCreativeCount(language: Language, count: number) {
  if (language === "en") return `${count} creative${count === 1 ? "" : "s"}`;
  return `${count} creativo${count === 1 ? "" : "s"}`;
}

function getLanguageSnapshot(): Language {
  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (savedLanguage === "en" || savedLanguage === "es") return savedLanguage;
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function subscribeToLanguageChange(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, callback);
  };
}

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
    image.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
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
  if (!context) throw new Error("IMAGE_ANALYSIS_UNAVAILABLE");
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
  const language = useSyncExternalStore(subscribeToLanguageChange, getLanguageSnapshot, () => "en");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "waiting" });
  const [error, setError] = useState<ErrorState>(null);
  const outputCanvas = useRef<HTMLCanvasElement>(null);
  const screenshotsRef = useRef<Screenshot[]>([]);
  const copy = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  };

  const addBlobs = useCallback(async (blobs: Blob[]) => {
    if (!blobs.length) return;
    setError(null);
    setStatus({ kind: "analyzing" });
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
      if (unreadable) setError({ kind: "unreadable", count: unreadable });
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
            setStatus({ kind: "added", added: unique.length, discarded });
          } else {
            setStatus({ kind: "notFound" });
          }
        });
        return [...current, ...unique];
      });
    } catch {
      setError({ kind: "processing" });
      setStatus({ kind: "review" });
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
    setStatus({ kind: "waiting" });
    setError(null);
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
        <div className="brand-copy">
          <strong>Meta Feed Composer</strong>
          <span>{copy.tagline}</span>
        </div>
        <div className="header-actions">
          <span className="privacy-note">{copy.privacy}</span>
          <div className="language-selector" role="group" aria-label={copy.languageSelector}>
            <button
              aria-pressed={language === "es"}
              className={language === "es" ? "active" : ""}
              lang="es"
              onClick={() => changeLanguage("es")}
              type="button"
            >
              ES
            </button>
            <button
              aria-pressed={language === "en"}
              className={language === "en" ? "active" : ""}
              lang="en"
              onClick={() => changeLanguage("en")}
              type="button"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="controls" aria-label={copy.settingsLabel}>
          <label>
            {copy.optionalTitle}
            <input
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={copy.titlePlaceholder}
              type="text"
              value={title}
            />
          </label>
          <div className="format-note">
            <strong>{copy.outputFormat}</strong>
            <span>{copy.outputDescription}</span>
          </div>
          <div className="actions">
            <button className="primary-button" disabled={!screenshots.length} onClick={download}>
              {copy.download}
            </button>
            <button className="text-button" disabled={!screenshots.length} onClick={clearAll}>
              {copy.clear}
            </button>
          </div>
        </aside>

        <div className="stage">
          <div
            aria-label={copy.pasteArea}
            className="paste-zone"
          >
            <div className="paste-key">⌘V</div>
            <strong>{copy.pasteHeading}</strong>
            <p>{copy.pasteHint}</p>
            <span className="paste-status" aria-live="polite">{getStatusText(language, status)}</span>
            {error && <span className="error-message" role="alert">{getErrorText(language, error)}</span>}
          </div>

          {screenshots.length > 0 && (
            <section className="source-panel" aria-label={copy.detectedFeeds}>
              <div className="panel-heading">
                <strong>{copy.detectedFeeds}</strong>
                <span>{getCreativeCount(language, screenshots.length)}</span>
              </div>
              <div className="source-list">
                {screenshots.map((item, index) => (
                  <article className="source-card" key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`${copy.detectedFeed} ${index + 1}`} src={item.thumbnailUrl} />
                    <div className="source-meta">
                      <strong>Feed {index + 1}</strong>
                      <span className="confidence">{copy.detectedFeed}</span>
                    </div>
                    <div className="item-actions">
                      <button disabled={index === 0} onClick={() => moveScreenshot(index, -1)} aria-label={copy.moveLeft}>←</button>
                      <button disabled={index === screenshots.length - 1} onClick={() => moveScreenshot(index, 1)} aria-label={copy.moveRight}>→</button>
                      <button onClick={() => removeScreenshot(item.id)}>{copy.remove}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="preview-panel" aria-label={copy.preview}>
            <div className="panel-heading">
              <strong>{copy.preview}</strong>
              <span>{screenshots.length ? copy.horizontalOutput : copy.pasteAtLeastOne}</span>
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
