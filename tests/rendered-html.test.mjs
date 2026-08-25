import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the clipboard-first Feed composer", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Meta Feed Composer<\/title>/i);
  assert.match(html, /Paste your screenshots here/);
  assert.match(html, /Optional title/);
  assert.match(html, /Instagram Feed/);
  assert.match(html, /aria-label="Language"/);
  assert.match(html, />ES<\/button>/);
  assert.match(html, />EN<\/button>/);
  assert.doesNotMatch(html, /type=["']file["']/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("includes complete English and Spanish interface copy", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  );

  assert.match(source, /Paste your screenshots here/);
  assert.match(source, /Pegá tus screenshots acá/);
  assert.match(source, /Download PNG/);
  assert.match(source, /Descargar PNG/);
  assert.match(source, /meta-feed-composer-language/);
  assert.match(source, /window\.navigator\.language/);
  assert.match(source, /document\.documentElement\.lang =/);
});
