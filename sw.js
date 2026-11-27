// 通信なしでもアプリをひらけるようにする（校庭など、Wi-Fi のとどかない所で使うため）。
// 通信できるときは、いつも新しい版を取りに行く。取れなかったとき（通信なし・おそすぎる）だけ、前に取っておいたものを出す。
// 記録（IndexedDB）にはさわらない。AI・測定室・アメダスの通信（logdb.699.jp、xcratch.699.jp）は、そのまま通す。
"use strict";
const CACHE = "akadako-multi-v2-shell-1";
const DEVICE_LIB = "https://699.jp/src/js/akadako.js";   // センサーとつなぐライブラリ（べつのホスト）
const SHELL = ["./", "index.html", "room.html", "v2db.js", "qrcode.js", "fonts/inter-600-latin.woff2", "fonts/inter-600-greek.woff2"];
const WAIT_MS = 4000;   // これより長く待たされたら、取っておいたものを出す

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 1 つ取れなくても、ほかは入れる
    await Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
    try { await cache.put(DEVICE_LIB, await fetch(new Request(DEVICE_LIB, { mode: "no-cors" }))); } catch (error) { /* 次にひらいたときに入る */ }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key.startsWith("akadako-multi-v2-shell-")) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  const mine = url.origin === self.location.origin && url.pathname.startsWith(new URL("./", self.location).pathname);
  if (request.method !== "GET" || !(mine || request.url === DEVICE_LIB)) return;   // API などは、そのまま
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const stored = () => cache.match(request, { ignoreSearch: request.mode === "navigate" });
    try {
      const fresh = await Promise.race([
        fetch(request),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout")), WAIT_MS))
      ]);
      if (fresh && (fresh.ok || fresh.type === "opaque")) cache.put(request, fresh.clone()).catch(() => {});
      return fresh;
    } catch (error) {
      const hit = await stored();
      if (hit) return hit;
      if (request.mode === "navigate") { const top = await cache.match("index.html"); if (top) return top; }
      throw error;
    }
  })());
});
