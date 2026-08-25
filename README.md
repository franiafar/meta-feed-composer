# Meta Feed Composer

[Open the live tool](https://meta-feed-composer-fran.dept-7420.chatgpt.site/) · Access is available to the DEPT workspace.

## English

Meta Feed Composer turns Meta preview screenshots into one clean horizontal image containing only the Instagram Feed cards. Paste screenshots directly from the clipboard; the tool identifies the Feed UI, ignores Stories and duplicate clipboard representations, normalizes every card, and exports a PNG.

### What it does

- Accepts pasted images only—there is no file picker.
- Detects Instagram Feed automatically in three- or four-preview Meta layouts.
- Rejects Instagram Stories and Facebook Stories.
- Removes duplicate clipboard representations with a high-resolution RGB fingerprint.
- Preserves the original UI inside each detected card.
- Places every Feed at the same size in one horizontal row.
- Supports an optional title and manual card reordering.
- Processes everything locally in the browser; pasted images are not uploaded.
- Includes a persistent English/Spanish interface.

### Quick tutorial

1. Copy one or more Meta preview screenshots.
2. Open the [live tool](https://meta-feed-composer-fran.dept-7420.chatgpt.site/) and press `Cmd + V` on macOS or `Ctrl + V` on Windows.
3. Check the detected Instagram Feed cards. Use the arrows if you want to change their order, or remove a card.
4. Optionally add a title.
5. Select **Download PNG**.

You do not need to crop screenshots, choose a panel count, or select a placement. If an image contains no recognizable Instagram Feed, the tool discards it instead of guessing.

### Detection approach

The browser analyzes candidate preview regions at a reduced working resolution. Each region is scored using the structural characteristics of Instagram Feed: a white account header, the image start position, a white CTA and interaction area, and the expected vertical-card proportions. Only high-confidence Feed candidates continue to the composition step.

### Development

Requirements: Node.js `>=22.13.0` and pnpm.

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
```

The main interface is in `app/page.tsx`; the detector is in `lib/feed-detection.mjs`; focused regression tests are under `tests/`.

---

## Español

Meta Feed Composer convierte screenshots de previews de Meta en una sola imagen horizontal que contiene únicamente las tarjetas de Instagram Feed. Pegá las capturas directamente desde el portapapeles: la herramienta identifica la UI de Feed, ignora Stories y representaciones duplicadas, normaliza todas las tarjetas y exporta un PNG.

### Qué hace

- Acepta imágenes pegadas; no usa un selector de archivos.
- Detecta Instagram Feed automáticamente en layouts de Meta con tres o cuatro previews.
- Descarta Instagram Stories y Facebook Stories.
- Elimina representaciones duplicadas del portapapeles con una huella RGB de alta resolución.
- Conserva la UI original dentro de cada tarjeta detectada.
- Coloca todos los Feeds con el mismo tamaño en una sola fila horizontal.
- Permite agregar un título opcional y reordenar las tarjetas.
- Procesa todo localmente en el navegador; las imágenes pegadas no se suben.
- Incluye una interfaz persistente en inglés y español.

### Tutorial rápido

1. Copiá uno o varios screenshots de previews de Meta.
2. Abrí la [herramienta](https://meta-feed-composer-fran.dept-7420.chatgpt.site/) y presioná `Cmd + V` en macOS o `Ctrl + V` en Windows.
3. Revisá los Instagram Feed detectados. Usá las flechas para cambiar el orden o quitá una tarjeta.
4. Si querés, agregá un título.
5. Elegí **Descargar PNG**.

No hace falta recortar las capturas, elegir la cantidad de paneles ni seleccionar un placement. Si una imagen no contiene un Instagram Feed reconocible, la herramienta la descarta en lugar de adivinar.

### Cómo funciona la detección

El navegador analiza posibles regiones de preview en una resolución de trabajo reducida. Cada región recibe un puntaje según la estructura de Instagram Feed: header blanco de la cuenta, posición de inicio de la imagen, área blanca de CTA e interacciones y proporciones esperadas de una tarjeta vertical. Solo los candidatos con alta confianza pasan a la composición final.

### Desarrollo

Requisitos: Node.js `>=22.13.0` y pnpm.

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
```

La interfaz principal está en `app/page.tsx`; el detector está en `lib/feed-detection.mjs`; las pruebas de regresión están en `tests/`.

---

Made with <3 by Francisco Iafar
