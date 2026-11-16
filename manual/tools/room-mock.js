// 説明書の「共有しよう」の画面写真を撮るための、にせものの測定室。
// 測定室のページ（s-link-logger の room.html）に読み込むと、サーバーのかわりに 3 つの班の記録を返し、
// 「重ねて表示」まで進める。URL の #scene=before（重ねただけ）／#scene=after（時間をずらしてそろえた）で場面を選ぶ。
// アプリ本体（index.html）では使わない。
(() => {
  "use strict";

  const scene = new URLSearchParams(location.hash.slice(1)).get("scene") || "before";

  // 3 つの班が、少しずつちがう時刻に「記録をはじめる」を押して、同じ実験（センサーを手でにぎる → はなす）をした
  const BASE = new Date(2026, 10, 16, 10, 15, 0).getTime();
  const GROUPS = [
    { deviceId: "d1", name: "1班", delay: 0, peak: 31.6, seed: 11 },
    { deviceId: "d2", name: "2班", delay: 12, peak: 30.4, seed: 23 },
    { deviceId: "d3", name: "3班", delay: 25, peak: 32.5, seed: 37 }
  ];
  const SENSORS = [{ key: "temperature", name: "温度", unit: "℃", color: "#ef5b5b", decimals: 1 }];
  const NOW = BASE + 95000;

  function rowsOf(group) {
    let seed = group.seed;
    const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.08; };
    const rows = [];
    let value = 24.6;
    for (let i = 0; i <= 120; i++) {
      const t = i * 0.5;                                  // 記録をはじめてからの秒
      const target = t >= 14 && t < 40 ? group.peak + 1 : 24.6;
      value += (target - value) * (1 - Math.exp(-0.085 * 0.5));
      rows.push([i + 1, Math.round(t * 1000), Math.round((value + noise()) * 10) / 10]);
    }
    return rows;
  }
  const data = GROUPS.map(group => {
    const rows = rowsOf(group);
    return {
      rows,
      device: {
        deviceId: group.deviceId, name: group.name, isOwner: false, session: "s1", resetSeq: 0,
        startedAt: BASE + group.delay * 1000, lastSeen: NOW, sensors: SENSORS,
        lastValues: { temperature: rows[rows.length - 1][2] }, rowCount: rows.length,
        summary: { points: rows.filter((row, i) => i % 3 === 0) }
      }
    };
  });

  const reply = body => Promise.resolve({ ok: true, status: 200, json: async () => body });
  window.fetch = url => {
    const rowsMatch = /\/devices\/([^/]+)\/rows\?from=(\d+)/.exec(String(url));
    if (rowsMatch) {
      const entry = data.find(item => item.device.deviceId === rowsMatch[1]);
      return reply({ device: entry.device, rows: entry.rows.filter(row => row[0] > Number(rowsMatch[2])) });
    }
    return reply({
      now: Date.now(),
      room: { name: "5年1組 理科", public: false, isOwner: false, lastUploadAt: Date.now() },
      devices: data.map(item => ({ ...item.device, lastSeen: Date.now() }))
    });
  };

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  window.addEventListener("load", async () => {
    await wait(800);
    document.getElementById("sel-all").click();
    await wait(200);
    document.getElementById("btn-overlay").click();
    await wait(800);
    if (scene === "after") {
      // 折れ線を左右にドラッグしたのと同じ結果になるように、「ずらす」の秒数を入れる
      const inputs = document.querySelectorAll('#ov-legend input[type="number"]');
      GROUPS.forEach((group, i) => {
        inputs[i].value = String(-group.delay);
        inputs[i].dispatchEvent(new Event("change"));
      });
      await wait(300);
    }
    if (document.activeElement) document.activeElement.blur();
  });
})();
