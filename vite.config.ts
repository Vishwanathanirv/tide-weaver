import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes dist/sw.js with the exact list of files this build produced, so the game is fully
 * playable offline after the first visit. The cache name is a hash of that list: a new build
 * replaces the old cache on activation.
 */
function offline(): Plugin {
  return {
    name: "tide-weaver-offline",
    apply: "build",
    generateBundle(_, bundle) {
      const files = ["./", ...Object.keys(bundle).filter((f) => !f.endsWith(".map")).map((f) => "./" + f), "./favicon.svg", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
      const list = [...new Set(files)].sort();
      const version = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
      const source = `const CACHE = "tide-weaver-${version}";
const FILES = ${JSON.stringify(list)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("tide-weaver-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Fresh page when online, so updates land; the cached game when not.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./", copy));
          }
          return res;
        })
        .catch(() => caches.match("./", { ignoreSearch: true })),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  base: "./",
  build: { target: "es2022", assetsInlineLimit: 0 },
  plugins: [offline()],
});
