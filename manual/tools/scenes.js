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

  // 左のカードの「写真の記録」をえらぶ。OFF からえらび直すと「写真の記録をはじめる前に」の注意が出るので、「OK」を押す
  function photoMode(value) {
    $("photoMode").value = value;
    $("photoMode").dispatchEvent(new Event("change", { bubbles: true }));
    if ($("camWarnDialog").open) $("camWarnOk").click();
  }
  // 写真のある記録の番号と、記録の件数。表の行から読むので、いちど表に切りかえる（行は表を出しているときにだけ作られる）
  const rows = () => [...document.querySelectorAll("#tableBody tr")];
  async function photoRows() {
    $("tableViewBtn").click();
    await wait(200);
    return { total: rows().length, seqs: rows().filter(tr => tr.querySelector(".row-photo")).map(tr => Number(tr.dataset.seq)) };
  }
  // 番号 seq の記録の、グラフの上での位置（左からの割合）。線を描く幅は、下のスクロールバーと同じ。見えているのは新しいほうの 120 件
  function ratioOf(seq, total) {
    const shown = Math.min(total, 120);
    const bar = $("chartScroll").getBoundingClientRect(), rect = $("chartCanvas").getBoundingClientRect();
    return (bar.left + (seq - 1 - (total - shown)) / (shown - 1) * bar.width - rect.left) / rect.width;
  }

  // アプリが記録を保存する IndexedDB を、台本からも開く（「開き直しても続きから」の場面用）。
  // 同じデータベースへの操作は順番に片づくので、これが終わったときには、アプリが先に出した操作も終わっている
  const DB_NAME = "akadako-multi";
  function dbTurn(work) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        Promise.resolve(work(db)).then(value => { db.close(); resolve(value); }, reject);
      };
    });
  }
  // アプリが保存先を開き終わるまで待つ（開く前の記録は保存されない）
  async function storeReady() {
    for (;;) {
      const list = await indexedDB.databases();
      if (list.some(item => item.name === DB_NAME && item.version >= 1)) break;
      await wait(50);
    }
    await dbTurn(() => {});
  }
  // アプリが書きこみ終わるまで待って、保存された記録の件数を返す
  function storeCount() {
    return dbTurn(db => new Promise((resolve, reject) => {
      const req = db.transaction("records", "readonly").objectStore("records").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  // 「外部」の「前の記録」に読ませる CSV。このアプリの「ダウンロード」と同じ形で、1 週間前に同じ実験（手でにぎる時間は短め）をした記録。
  // 撮るとき（記録をとめたあと）にも「いまの時刻」の値があるように、150 秒ぶん作る
  function previousCsv() {
    const lines = ["日時,時刻,温度,単位,メモ"];
    let value = 24.2, seed = 7;
    for (let i = 0; i <= 300; i++) {
      const t = i * 0.5;
      value += ((t >= 8 && t < 27 ? 30.6 : 24.2) - value) * (1 - Math.exp(-0.085 * 0.5));
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 4294967296 - 0.5) * 0.08;
      const s = Math.floor(t), time = `10:${String(20 + Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${t % 1 ? 5 : 0}`;
      lines.push(`2026/11/9,${time},${(value + noise).toFixed(1)},℃,`);
    }
    return new File(["\uFEFF" + lines.join("\r\n")], "AkaDako_温度_2026-11-09T01-21-05.csv", { type: "text/csv" });
  }
  // 「外部」のタブを押して、えらぶ画面を出す
  async function openExternal() {
    tab("external").click();
    await wait(200);
  }
  // えらぶ画面で「前の記録」をえらび、ファイルを入れる（子どもが「ファイルをえらぶ」でえらんだのと同じ）
  async function pickPrevious() {
    const radio = document.querySelector('input[name="extType"][value="file"]');
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    const files = new DataTransfer();
    files.items.add(previousCsv());
    $("extFileInput").files = files.files;
    $("extFileInput").dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 200 && !$("extFileName").textContent.endsWith(".csv"); i++) await wait(50);   // 読みこみが終わるまで
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

    // メモに写真をつける。にぎっているとちゅうで記録をとめ、新しいほうの記録を押して「写真をとる」
    // （build.sh がこの場面は早めに撮るので、左のカメラの映像にも手がうつっている）
    async memophoto() {
      await connect();
      $("recordBtn").click();
      await wait(22000);
      $("recordBtn").click();
      await wait(300);
      tap(0.62);
      await wait(100);
      $("memoCam").click();
      await wait(500);
      $("memoInput").value = "手でにぎった";
    },

    // 写真の記録を「10秒ごと」にして記録する。写真のある記録に黒い丸がつく（ふきだしは文字のメモだけ）
    async photos() {
      await connect();
      photoMode("10000");
      await record();
      await memo(0.36, "手でにぎった");
      $("chartCanvas").dispatchEvent(new PointerEvent("pointerleave"));
    },

    // 写真のある記録（にぎっているとちゅうの 3 枚目）にマウスを乗せる
    async photohover() {
      await scenes.photos();
      const { total, seqs } = await photoRows();
      $("chartViewBtn").click();
      await wait(200);
      pointer("pointermove", ratioOf(seqs[2], total));
      await wait(300);
    },

    // 表で、カメラの印にマウスを乗せる
    async phototable() {
      await scenes.photos();
      const { seqs } = await photoRows();
      const row = rows().find(tr => Number(tr.dataset.seq) === seqs[2]);
      // 表を動かすと、浮かんだ写真は消える（アプリが scroll のイベントで消す）。早回しのあいだは画面の描き直しが無く、
      // 台本で動かしたぶんのイベントが撮る瞬間に届いて写真が消えてしまうので、この場面ではアプリに届かないようにする
      const wrap = $("tableWrap");
      window.addEventListener("scroll", event => { if (event.target === wrap) event.stopPropagation(); }, true);
      wrap.scrollTop = Math.max(0, row.offsetTop - 150);
      await wait(200);
      row.querySelector(".row-photo").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await wait(500);
    },

    // 「開き直しても続きから」の 1 回目: 保存を使って（URL に store=off を付けないで）記録する。build.sh はこの写真を使わない
    async restore1() {
      await storeReady();
      await connect();
      photoMode("10000");
      await record();
      await memo(0.36, "手でにぎった");
      await wait(1500);   // 保存は 0.4 秒ためてから書く
      document.title = `saved ${await storeCount()}`;
    },

    // 2 回目: 同じ保存先で開き直したところ。「前の記録のつづきから表示しています」は 2.6 秒で消えるので、出たままにして撮る
    async restore2() {
      const toast = $("toast");
      const keep = () => { if (toast.textContent && !toast.classList.contains("show")) toast.classList.add("show"); };
      new MutationObserver(keep).observe(toast, { attributes: true, attributeFilter: ["class"] });
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

    // 3 つ（温度・湿度・照度）を重ねる。目もりが 左・右・いちばん右 に出る
    async overlay() {
      await connect();
      $("compareToggle").click();
      tab("humidity").click();
      await wait(500);
      tab("brightness").click();
      await wait(500);
      await record();
      $("layoutOverlay").click();
    },

    // 「外部」のタブを押して出る、えらぶ画面
    async extpick() {
      await connect();
      await openExternal();
      if (document.activeElement) document.activeElement.blur();
    },

    // 「外部」だけ: 太陽の高さ（今日 1 日ぶん）
    async extsun() {
      await connect();
      await openExternal();
      $("extOk").click();
      await wait(500);
    },

    // 温度と「前の記録」（1 週間前の温度）をくらべて、重ねる。同じ温度どうしなので、目もりが共通になる
    async extprev() {
      await connect();
      $("compareToggle").click();
      await openExternal();
      await pickPrevious();
      $("extOk").click();
      await wait(500);
      await record();
      $("layoutOverlay").click();
    },

    // 「しらべる」: 記録とメモを AI（mock.js のにせもの）にしらべてもらったところ。答えのはじめが見えるように上へもどし、つづきの質問を書きかけにする
    async ask() {
      await scenes.graph();
      $("askBtn").click();
      await wait(300);
      $("askInput").value = "このグラフから、どんなことが分かる？";   // 開いただけでは AI にきかない。質問を書いて「きく」
      $("askForm").requestSubmit();
      await wait(1200);
      $("askLog").scrollTop = 0;
      $("askInput").value = "どうして、手をはなすと下がるの？";
      if (document.activeElement) document.activeElement.blur();
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
  still.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }"
    + " .cam-view.is-shot::after { display: none !important; }";   // 写真をとった合図（白く光る）が、動きを止めると白いまま残るので消す
  document.head.appendChild(still);

  window.addEventListener("load", async () => {
    await wait(300);
    await (scenes[scene] || scenes.start)();
    await wait(6000);   // 「接続しました」などのお知らせが消えるのを待つ
    document.documentElement.dataset.sceneDone = scene;
  });
})();
