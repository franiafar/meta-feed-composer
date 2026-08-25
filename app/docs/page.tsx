"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

type Language = "en" | "es";

const STORAGE_KEY = "meta-feed-composer-language";
const LANGUAGE_EVENT = "meta-feed-composer-language-change";

function getLanguageSnapshot(): Language {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "es") return saved;
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function subscribeToLanguageChange(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LANGUAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANGUAGE_EVENT, callback);
  };
}

const COPY = {
  en: {
    eyebrow: "Deployment Tools · Quick guide",
    title: "Meta Feed Composer",
    intro: "Turn pasted Meta previews into one clean horizontal PNG containing only Instagram Feed cards.",
    back: "Open tool",
    deck: "Download tutorial deck",
    heading: "Three steps. No setup.",
    steps: [
      ["Paste", "Copy one or more complete Meta preview screenshots and press Cmd + V or Ctrl + V in the tool."],
      ["Check", "The tool finds Instagram Feed automatically, removes Stories and duplicate clipboard images, and keeps the original UI."],
      ["Download", "Optionally add a title, reorder the cards, and download the finished horizontal PNG."],
    ],
    note: "Your screenshots are processed locally in the browser and are not uploaded.",
    language: "Language",
  },
  es: {
    eyebrow: "Deployment Tools · Guía rápida",
    title: "Meta Feed Composer",
    intro: "Convertí previews pegados de Meta en un PNG horizontal limpio que contiene únicamente tarjetas de Instagram Feed.",
    back: "Abrir herramienta",
    deck: "Descargar deck tutorial",
    heading: "Tres pasos. Sin configuración.",
    steps: [
      ["Pegá", "Copiá uno o varios screenshots completos de previews de Meta y presioná Cmd + V o Ctrl + V en la herramienta."],
      ["Revisá", "La herramienta encuentra Instagram Feed automáticamente, descarta Stories y duplicados del portapapeles, y conserva la UI original."],
      ["Descargá", "Si querés, agregá un título, reordená las tarjetas y descargá el PNG horizontal terminado."],
    ],
    note: "Los screenshots se procesan localmente en el navegador y no se suben.",
    language: "Idioma",
  },
} as const;

export default function DocsPage() {
  const language = useSyncExternalStore(subscribeToLanguageChange, getLanguageSnapshot, () => "en");
  const copy = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = (next: Language) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  };

  return (
    <main className="docs-shell">
      <header className="docs-header">
        <Link className="docs-wordmark" href="/">Meta Feed Composer</Link>
        <div className="language-selector" role="group" aria-label={copy.language}>
          <button aria-pressed={language === "es"} className={language === "es" ? "active" : ""} onClick={() => changeLanguage("es")} type="button">ES</button>
          <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => changeLanguage("en")} type="button">EN</button>
        </div>
      </header>

      <article className="docs-content">
        <p className="docs-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="docs-intro">{copy.intro}</p>
        <div className="docs-actions">
          <Link className="docs-primary" href="/">{copy.back}</Link>
          <a className="docs-secondary" href="/Meta-Feed-Composer-Tutorial.pptx">{copy.deck}</a>
        </div>

        <section className="docs-tutorial">
          <h2>{copy.heading}</h2>
          <div className="docs-steps">
            {copy.steps.map(([stepTitle, description], index) => (
              <div className="docs-step" key={stepTitle}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{stepTitle}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="docs-note">{copy.note}</p>
      </article>
    </main>
  );
}
