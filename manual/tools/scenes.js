// 説明書の画面写真を撮るための台本。URL の #scene=名前 で場面を選ぶ。
// アプリの画面を、子どもが使うのと同じ順番でボタンを押して進める。アプリ本体（index.html）では使わない。
(() => {
  "use strict";

  const scene = new URLSearchParams(location.hash.slice(1)).get("scene") || "start";
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tab = key => document.querySelector(`.sensor-btn[data-sensor="${key}"]`);

  // グラフの上の位置（左からの割合 0〜1）でマウスの操作をまねる
  function pointer(type, ratio) {
    const canvas = $("chartCanvas");
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse",
      clientX: rect.left + rect.width * ratio, clientY: rect.top + rect.height * 0.45
    }));
  }
  function tap(ratio) { pointer("pointerdown", ratio); pointer("pointerup", ratio); }
  function drag(from, to) {
    pointer("pointerdown", from);
    pointer("pointermove", (from + to) / 2);
    pointer("pointermove", to);
    pointer("pointerup", to);
  }
  async function memo(ratio, text) {
    tap(ratio);
    await wait(100);
    $("memoInput").value = text;
    $("memoSave").click();
    await wait(100);
  }

  async function connect() {
    $("connectBtn").click();
    await wait(1500);
  }
  // 60 秒ぶん記録してとめる（14〜40 秒が「手でにぎっている」あいだ）
  async function record() {
    $("recordBtn").click();
    await wait(60500);
    $("recordBtn").click();
    await wait(500);
  }

  const scenes = {
    async start() {},

    async connected() { await connect(); },

    async recording() {
      await connect();
      $("recordBtn").click();
      await wait(26000);   // にぎっているとちゅう（build.sh がこの場面だけ早めに撮る）
    },

    async graph() {
      await connect();
      await record();
      await memo(0.26, "手でにぎった");
      await memo(0.68, "手をはなした");
      $("chartCanvas").dispatchEvent(new PointerEvent("pointerleave"));   // マウスをグラフの外へ
    },

    async hover() {
      await scenes.graph();
      pointer("pointermove", 0.52);
    },

    async memo() {
      await connect();
      await record();
      tap(0.26);
      await wait(100);
      $("memoInput").value = "手でにぎった";
    },

    async select() {
      await scenes.graph();
      drag(0.3, 0.7);
    },

    async table() {
      await scenes.graph();
      $("tableViewBtn").click();
      await wait(200);
      // メモを書いた行が見えるところまで表を動かす
      const row = [...document.querySelectorAll("#tableBody tr")].find(tr => tr.querySelector(".memo-input") && tr.querySelector(".memo-input").value);
      if (row) $("tableWrap").scrollTop = Math.max(0, row.offsetTop - 120);
    },

    async compare() {
      await connect();
      $("compareToggle").click();
      tab("humidity").click();
      await wait(500);
      await record();
    },

    async overlay() {
      await scenes.compare();
      $("layoutOverlay").click();
    },

    async room() {
      await scenes.graph();
      $("shareBtn").click();
    },

    async water() {
      await connect();
      tab("waterTemperature").click();
      await wait(200);
      if (document.activeElement) document.activeElement.blur();   // リンクの枠（フォーカス）を消す
    }
  };

  // 色が変わるとちゅうで撮られないように、動きのある見た目を止める
  const still = document.createElement("style");
  still.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.appendChild(still);

  window.addEventListener("load", async () => {
    await wait(300);
    await (scenes[scene] || scenes.start)();
    await wait(6000);   // 「接続しました」などのお知らせが消えるのを待つ
    document.documentElement.dataset.sceneDone = scene;
  });
})();
