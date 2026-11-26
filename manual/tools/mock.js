// 説明書の画面写真を撮るための、にせもののS-LiNKデバイスとカメラと AI。
// s-link.js のかわりに読み込むと、「AkaDako」の表示が本物と同じように「接続中」になり、
// 「センサーを手でにぎる → はなす」ときのような値を返す。左のカードのカメラの映像には、絵（つくえの上のセンサー）が出る。
// 「しらべる」が AI にきく通信（/agai/ai）には、送られてきた記録の数字を使って、それらしい答えを返す（外には通信しない）。
// アプリ本体（index.html）では使わない。
(() => {
  "use strict";

  // 画面に出る時刻を 10:15 からにそろえる（撮るたびに時刻が変わらないように）
  const RealDate = Date;
  const offset = new RealDate(2026, 10, 16, 10, 15, 0).getTime() - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(RealDate.now() + offset);
    }
    static now() { return RealDate.now() + offset; }
  }
  window.Date = ShiftedDate;

  // 毎回同じ形のグラフになるように、種を決めた乱数を使う
  let seed = 20261116;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const noise = size => (random() - 0.5) * 2 * size;

  // 接続してから 14〜40 秒のあいだ「手でにぎっている」
  let connectedAt = null;
  const seconds = () => (RealDate.now() - connectedAt) / 1000;
  const holding = () => { const t = seconds(); return t >= 14 && t < 40; };

  // 目標の値へ少しずつ近づく（温度計がゆっくり変わる感じ）
  function follower(start, speed) {
    let value = start, last = null;
    return target => {
      const now = RealDate.now();
      const dt = last === null ? 0 : Math.min(5, (now - last) / 1000);
      last = now;
      value += (target - value) * (1 - Math.exp(-speed * dt));
      return value;
    };
  }
  const temperature = follower(24.6, 0.085);
  const humidity = follower(47.5, 0.06);
  const brightness = follower(520, 0.9);
  const water = follower(21.4, 0.03);

  const board = {
    isConnected: true,
    // AI にきくときに、アプリが「本物のデバイスがつながっているか」を確かめるために読む（署名付き UID とファームウェアの版）
    board: { boardSignedUid: async () => [1, 2, 3, 4], version: { type: 2, major: 3, minor: 1 } },
    onDisconnected() {},
    disconnect() { this.isConnected = false; },
    analog: () => 0,
    fetchTemperature: async () => temperature(holding() ? 32.4 : 24.6) + noise(0.04),
    fetchHumidity: async () => humidity(holding() ? 71 : 47.5) + noise(0.15),
    fetchBrightness: async () => brightness(holding() ? 60 : 520) + noise(6),
    fetchOpticalDistance: async () => 31.5 + Math.sin(seconds() / 4) * 9 + noise(0.3),
    fetchPressure: async () => 1013.2 + noise(0.08),
    fetchAccelerationMagnitude: async () => 9.81 + noise(0.03),
    fetchRoll: async () => 2 + Math.sin(seconds() / 3) * 18 + noise(0.4),
    fetchWaterTemperatureA: async () => water(21.4) + noise(0.04)
  };

  window.AkaDako = {
    AnalogRead: { A1: 0, A2: 1, B1: 2, B2: 3 },
    connect: async () => {
      connectedAt = RealDate.now();
      board.isConnected = true;
      return board;
    }
  };

  // ===== にせものの AI =====
  // 生成 AI（https://xcratch.699.jp/agai/ai）への要求だけを横取りして、{ content: 答え, error: null } を返す。ほかの通信はそのまま通す。
  // 「しらべる」の要求は、文のはじめが「あなたは小学生に理科を教える先生です」で始まる。それ以外（AI のタブ）は数字を 1 つ答える
  const short = time => String(time || "").replace(/\.\d$/, "");   // 10:15:41.8 → 10:15:41
  function researchAnswer(text) {
    const sum = /\n(.+?)（(.*?)）: 最小 ([-\d.]+)（.*?）、最大 ([-\d.]+)（(.*?)）、平均 [-\d.]+、はじめ ([-\d.]+)、おわり ([-\d.]+)/.exec(text);
    if (!sum) return "記録の数が少ないので、まだよく分かりません。もう少し長く記録してみましょう。";
    const [, name, unit, , max, maxAt, first, last] = sum;
    const memos = [...((text.split("[メモ]")[1] || "").split("[")[0]).matchAll(/([\d:.]+) 「(.+?)」/g)].map(m => ({ at: short(m[1]), text: m[2] }));
    if (/\[これまでのやりとり\]/.test(text)) {
      return `手をはなすと、手のあたたかさがセンサーにつたわらなくなります。すると、センサーのねつがまわりの空気ににげていくので、${name}は少しずつ下がります。`
        + `はじめの ${first}${unit} に近づくほど、下がり方はゆっくりになります。`;
    }
    return [
      "1. 全体のようす",
      `${name}は、はじめ ${first}${unit} でした。とちゅうで ${max}${unit} まで上がり、そのあと ${last}${unit} まで下がりました。`,
      "",
      "2. 目立つところ",
      `いちばん高かったのは ${short(maxAt)} の ${max}${unit} です。${memos[0] ? `${memos[0].at} ごろから、急に上がりはじめています。` : ""}`,
      "",
      "3. メモとの関係",
      memos.length >= 2 ? `「${memos[0].text}」のメモのあとで上がり、「${memos[1].text}」のメモのあとで下がっています。`
        : memos.length ? `「${memos[0].text}」のメモのあとで、値が変わっています。` : "メモはありません。",
      "",
      "4. 考えられる理由",
      "手のあたたかさがセンサーにつたわって、上がったと考えられます。手をはなすと、まわりの空気でひえて下がります。",
      "",
      "5. 次にしらべるとよいこと",
      "・にぎる時間を長くすると、何度まで上がるか",
      "・手をはなしてから、もとの温度にもどるまでの時間"
    ].join("\n");
  }
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = async (url, options) => {
    if (!String(url).includes("/agai/ai")) {
      if (!realFetch) throw new TypeError("fetch がありません");
      return realFetch(url, options);
    }
    let text = "";
    try {
      const part = JSON.parse(options.body).content.find(one => typeof one.text === "string");
      text = part ? part.text : "";
    } catch (error) { /* 読めない要求には、数字を返す */ }
    const content = text.startsWith("あなたは小学生に理科を教える先生です") ? researchAnswer(text) : "3";
    return new Response(JSON.stringify({ content, error: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  // ===== にせもののカメラ =====
  // ヘッドレスの Chrome にはカメラが無いので、絵を描いた canvas の映像を getUserMedia で返す。
  // 絵は「つくえの上のセンサー」で、手でにぎっているあいだ（14〜40 秒）は手がかぶさる。
  const CAM_W = 640, CAM_H = 480;
  const camCanvas = document.createElement("canvas");
  camCanvas.width = CAM_W;
  camCanvas.height = CAM_H;
  const cc = camCanvas.getContext("2d");
  function pill(x, y, w, h, r, fill, stroke) {
    cc.beginPath();
    cc.roundRect(x, y, w, h, r);
    cc.fillStyle = fill;
    cc.fill();
    if (stroke) { cc.strokeStyle = stroke; cc.lineWidth = 3; cc.stroke(); }
  }
  let camTick = 0;
  function drawCam() {
    const held = connectedAt !== null && holding();
    // つくえ
    cc.fillStyle = "#ead7b4";
    cc.fillRect(0, 0, CAM_W, CAM_H);
    cc.fillStyle = "#e2cca3";
    for (let y = 60; y < CAM_H; y += 120) cc.fillRect(0, y, CAM_W, 5);
    // ノートとえんぴつ
    cc.save();
    cc.translate(118, 118);
    cc.rotate(-0.12);
    pill(-92, -84, 184, 168, 8, "#ffffff", "#c9d6df");
    cc.fillStyle = "#b9d3e6";
    for (let i = 0; i < 6; i++) cc.fillRect(-72, -52 + i * 22, 144, 3);
    cc.restore();
    cc.save();
    cc.translate(250, 96);
    cc.rotate(0.5);
    pill(-70, -7, 118, 14, 3, "#f3b62c");
    pill(48, -7, 16, 14, 3, "#e98d8d");
    cc.beginPath();
    cc.moveTo(-70, -7); cc.lineTo(-92, 0); cc.lineTo(-70, 7); cc.closePath();
    cc.fillStyle = "#e9cfa4";
    cc.fill();
    cc.restore();
    // USB ケーブル
    cc.beginPath();
    cc.moveTo(398, 250);
    cc.bezierCurveTo(470, 180, 520, 120, 640, 70);
    cc.strokeStyle = "#4b5661";
    cc.lineWidth = 9;
    cc.lineCap = "round";
    cc.stroke();
    // センサー（ボード）
    cc.save();
    cc.translate(330, 290);
    cc.rotate(-0.08);
    cc.fillStyle = "rgba(90, 60, 20, .18)";
    cc.beginPath();
    cc.roundRect(-84, -52, 180, 124, 14);
    cc.fill();
    pill(-90, -60, 180, 120, 14, "#d9433f", "#a92f2c");
    pill(-70, -42, 62, 40, 5, "#ffffff");
    pill(10, -40, 44, 44, 5, "#2c3640");
    pill(62, -24, 28, 30, 3, "#b7c0c8");
    cc.fillStyle = "#f6d24a";
    for (let i = 0; i < 6; i++) cc.fillRect(-66 + i * 24, 28, 12, 18);
    cc.restore();
    // 手（にぎっているあいだだけ）
    if (held) {
      cc.save();
      cc.translate(360, 330);
      cc.rotate(-0.5);
      const skin = "#f2c29b", edge = "#d79e75";
      pill(-40, 10, 190, 300, 60, skin, edge);            // うで・手のひら
      for (let i = 0; i < 4; i++) pill(-38 + i * 46, -112 + Math.abs(i - 1.3) * 16, 40, 160, 20, skin, edge);   // 指
      pill(-96, 30, 44, 120, 22, skin, edge);             // おや指
      pill(-36, 20, 182, 120, 40, skin);                  // 指のつけ根の線をかくす
      cc.restore();
    }
    // 映像が止まって見えないように、毎回どこかを少しだけ変える（見えない 1 点）
    camTick += 1;
    cc.fillStyle = camTick % 2 ? "#ead7b4" : "#ead7b5";
    cc.fillRect(0, 0, 1, 1);
  }
  let camTimer = null;
  const media = navigator.mediaDevices || {};
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: media });
  media.getUserMedia = async constraints => {
    if (!constraints || !constraints.video) throw new DOMException("マイクはありません", "NotFoundError");
    drawCam();
    if (camTimer === null) camTimer = setInterval(drawCam, 200);
    return camCanvas.captureStream(15);
  };
})();
