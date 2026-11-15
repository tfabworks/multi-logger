// 説明書の画面写真を撮るための、にせもののボード。
// s-link.js のかわりに読み込むと、「ボード接続」が本物と同じように ON になり、
// 「センサーを手でにぎる → はなす」ときのような値を返す。アプリ本体（index.html）では使わない。
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
    board: {},
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
})();
