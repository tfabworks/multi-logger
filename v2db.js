// 記録の保存先（IndexedDB）。アプリ（index.html）と、くらべる・測定室のページ（room.html）で同じものを使う。
// 本番（log.699.jp/ の "akadako-multi"）とは別の名前にしてある。同じ端末で本番を開いても、たがいの記録にはさわらない。
//
//   recs    … 記録 1 つごとの見出し。キーは id
//             { id, name（空なら、日付・時刻・センサーの名前で表示する）, createdAt, updatedAt,
//               keys: [センサーのキー…]（自分ではかったもの → 自分ではかっていないデータ の順）,
//               sensors: { キー: { name, unit, decimals（null は「そのまま」）, color } }（一覧やくらべる画面で、名前と単位を出すための写し）,
//               interval（記録間隔 ms）, startedAt / endedAt（最初と最後の記録の時刻 ms。まだ無ければ null）,
//               count（いちばん多いセンサーの件数）, photoCount, fine（1 秒より短い間隔の記録があるか）,
//               source: "local" | "room" | "file", ui: 画面のようす, place: 場所（アメダスの地点）,
//               deletedAt（消した時刻。「もとにもどす」のために、しばらく残す。一覧には出さない） }
//   records … 記録の 1 件ごと。キーは [rec, k, seq]
//             { rec, k（センサーのキー）, seq（番号）, t（時刻 ms）, v（値）, note?, memo?, photo?（写真の id）, thumb?（小さな見本の dataURL） }
//   photos  … 写真の画像。キーは id。{ id, rec, blob }。索引 "rec"
//   meta    … そのほか（キーは名前）
(function () {
  "use strict";
  var NAME = "akadako-multi-v2", VERSION = 1;
  var db = null, opening = null;

  function done(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function finished(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error("保存できませんでした")); };
    });
  }
  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    if (!window.indexedDB) return Promise.reject(new Error("このブラウザでは記録を保存できません"));
    opening = new Promise(function (resolve, reject) {
      var req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function () {
        var d = req.result;
        d.createObjectStore("recs", { keyPath: "id" });
        d.createObjectStore("records", { keyPath: ["rec", "k", "seq"] });
        d.createObjectStore("photos", { keyPath: "id" }).createIndex("rec", "rec");
        d.createObjectStore("meta");
      };
      req.onsuccess = function () {
        db = req.result;
        db.onversionchange = function () { db.close(); db = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error("blocked")); };
    }).finally(function () { opening = null; });
    return opening;
  }
  function rangeOf(recId, key) {
    return key === undefined
      ? IDBKeyRange.bound([recId, "", 0], [recId, "￿", Number.MAX_SAFE_INTEGER])
      : IDBKeyRange.bound([recId, key, 0], [recId, key, Number.MAX_SAFE_INTEGER]);
  }
  function newId(prefix) {
    return (prefix || "r") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  window.V2DB = {
    NAME: NAME,
    open: open,
    raw: function () { return db; },   // 開いたあとの IDBDatabase（まとめて書くとき用）
    done: done,
    finished: finished,
    rangeOf: rangeOf,
    newId: newId,

    // 記録の見出し。消したもの（deletedAt つき）は、all を true にしたときだけ返す。新しい順
    listRecs: async function (all) {
      var d = await open();
      var list = await done(d.transaction("recs").objectStore("recs").getAll());
      return list.filter(function (rec) { return all || !rec.deletedAt; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },
    getRec: async function (id) {
      var d = await open();
      return (await done(d.transaction("recs").objectStore("recs").get(id))) || null;
    },
    putRec: async function (rec) {
      var d = await open(), tx = d.transaction("recs", "readwrite");
      tx.objectStore("recs").put(rec);
      await finished(tx);
    },
    // その記録の全部の行（センサーのキー → 番号の順）
    loadRows: async function (recId) {
      var d = await open();
      return done(d.transaction("records").objectStore("records").getAll(rangeOf(recId)));
    },
    putRows: async function (rows) {
      if (!rows.length) return;
      var d = await open(), tx = d.transaction("records", "readwrite"), store = tx.objectStore("records");
      rows.forEach(function (row) { store.put(row); });
      await finished(tx);
    },
    // 記録を、行も写真もまとめて消す
    deleteRec: async function (recId) {
      var d = await open(), tx = d.transaction(["recs", "records", "photos"], "readwrite");
      tx.objectStore("recs").delete(recId);
      tx.objectStore("records").delete(rangeOf(recId));
      var index = tx.objectStore("photos").index("rec"), req = index.openKeyCursor(IDBKeyRange.only(recId));
      req.onsuccess = function () {
        var cursor = req.result;
        if (!cursor) return;
        tx.objectStore("photos").delete(cursor.primaryKey);
        cursor.continue();
      };
      await finished(tx);
    },
    photoGet: async function (id) {
      var d = await open();
      var found = await done(d.transaction("photos").objectStore("photos").get(id));
      return found ? found.blob : null;
    },
    photoPut: async function (photo) {   // { id, rec, blob }
      var d = await open(), tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").put(photo);
      await finished(tx);
    },
    photosOf: async function (recId) {   // [{ id, rec, blob }]
      var d = await open();
      return done(d.transaction("photos").objectStore("photos").index("rec").getAll(IDBKeyRange.only(recId)));
    },
    // その記録の写真だけを消す（記録とメモの文は残す）。消した枚数を返す
    deletePhotosOf: async function (recId) {
      var d = await open(), tx = d.transaction(["recs", "records", "photos"], "readwrite"), count = 0;
      var photos = tx.objectStore("photos"), keyReq = photos.index("rec").openKeyCursor(IDBKeyRange.only(recId));
      keyReq.onsuccess = function () {
        var cursor = keyReq.result;
        if (!cursor) return;
        photos.delete(cursor.primaryKey);
        count += 1;
        cursor.continue();
      };
      var rowReq = tx.objectStore("records").openCursor(rangeOf(recId));
      rowReq.onsuccess = function () {
        var cursor = rowReq.result;
        if (!cursor) return;
        var row = cursor.value;
        if (row.photo !== undefined || row.thumb !== undefined) {
          delete row.photo;
          delete row.thumb;
          cursor.update(row);
        }
        cursor.continue();
      };
      var recReq = tx.objectStore("recs").get(recId);
      recReq.onsuccess = function () {
        var rec = recReq.result;
        if (rec) { rec.photoCount = 0; tx.objectStore("recs").put(rec); }
      };
      await finished(tx);
      return count;
    },
    metaGet: async function (name) {
      var d = await open();
      return done(d.transaction("meta").objectStore("meta").get(name));
    },
    metaPut: async function (name, value) {
      var d = await open(), tx = d.transaction("meta", "readwrite");
      if (value === null || value === undefined) tx.objectStore("meta").delete(name);
      else tx.objectStore("meta").put(value, name);
      await finished(tx);
    },
    // この端末の記録を、ぜんぶ消す
    clearAll: async function () {
      var d = await open(), tx = d.transaction(["recs", "records", "photos"], "readwrite");
      tx.objectStore("recs").clear();
      tx.objectStore("records").clear();
      tx.objectStore("photos").clear();
      await finished(tx);
    }
  };
})();
