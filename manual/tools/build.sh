#!/bin/bash
# 説明書（manual.pdf）を作り直す。
#   manual/tools/build.sh shots   … アプリの画面写真を撮り直す（manual/img/shot-*.png。測定室の 2 枚もふくむ）
#   manual/tools/build.sh room    … 測定室のページの写真だけを撮り直す（manual/img/shot-share-*.png。「重ねて表示」と、公開中の「JSON」ボタン）
#   manual/tools/build.sh pdf     … manual/index.html から manual.pdf を作る
#   manual/tools/build.sh         … 両方
# アプリの画面を変えたら shots → 写真を見て manual/index.html の説明や印の位置を直す → pdf の順に。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WORK="${TMPDIR:-/tmp}/multi-logger-manual"
SCENES="start connected recording graph hover memo memophoto photohover phototable select table compare overlay extpick extsun extprev ask room water"
# 「共有しよう」の写真は測定室のページ（room.html）を撮る。場所がちがうときは ROOM_HTML で指定する
ROOM_HTML="${ROOM_HTML:-$ROOT/room.html}"
ROOM_SCENES="before after json"

PROFILE="$WORK/profile"
chrome() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$PROFILE" "$@" 2>/dev/null
}
# 写真は 1920×1200（1.5 倍）。2 倍だと PDF が 8MB をこえる
shoot() {
  chrome --window-size=1280,800 --force-device-scale-factor=1.5 "$@"
}

shots() {
  mkdir -p "$WORK" "$ROOT/manual/img"
  # index.html の複製を作り、akadako.js をにせもののボードとカメラ（mock.js）に差し替えて、台本を足す
  sed -e 's#<script src="https://699.jp/src/js/akadako.js"></script>#<script src="mock.js"></script>#' \
      -e 's#</body>#<script src="scenes.js"></script></body>#' \
      "$ROOT/index.html" > "$WORK/app.html"
  grep -q 'src="mock.js"' "$WORK/app.html" || { echo "akadako.js の読み込みを差し替えられませんでした" >&2; exit 1; }
  cp "$ROOT/manual/tools/mock.js" "$ROOT/manual/tools/scenes.js" "$WORK/"
  for scene in $SCENES; do
    # 台本は時計を早回しして進める（60 秒の記録も数秒で終わる）。にせもののカメラの映像と「写真をとる」も早回しのままで動く。
    # 「手でにぎっているとちゅう」の場面は、値が上がっていて、カメラに手がうつっているところで撮る
    budget=120000
    case "$scene" in recording|memophoto) budget=35000 ;; esac
    # ?store=off … 記録をブラウザに保存しない・前の記録を戻さない（場面どうしがまざらないように）
    shoot --virtual-time-budget=$budget \
      --screenshot="$ROOT/manual/img/shot-$scene.png" "file://$WORK/app.html?store=off#scene=$scene"
    echo "撮影: shot-$scene.png"
  done
  restore_shot
  room_shots
}

# 「開き直しても続きから」の写真。この場面だけは保存を使うので store=off を付けず、専用のプロフィールで 2 回開く
restore_shot() {
  PROFILE="$WORK/profile-restore"
  rm -rf "$PROFILE"
  # 1 回目: 記録して、ブラウザに保存する（写真は使わない）。保存先が開くのを待つあいだも時計が進むので、長めにとる
  shoot --virtual-time-budget=600000 --screenshot="$WORK/restore1.png" "file://$WORK/app.html#scene=restore1"
  # 2 回目: 開き直す。保存から戻すのは早回しできないので、ここだけ実時間で待ってから撮る
  shoot --timeout=4000 --screenshot="$ROOT/manual/img/shot-restore.png" "file://$WORK/app.html#scene=restore2"
  PROFILE="$WORK/profile"
  echo "撮影: shot-restore.png"
}

# 測定室のページを、にせものの測定室（room-mock.js）で開いて「重ねて表示」を撮る
room_shots() {
  if [ ! -f "$ROOM_HTML" ]; then
    echo "測定室のページが見つからないので、shot-share-*.png は撮り直しません: $ROOM_HTML" >&2
    return
  fi
  sed -e 's#</head>#<script src="room-mock.js"></script></head>#' "$ROOM_HTML" > "$WORK/room.html"
  grep -q 'src="room-mock.js"' "$WORK/room.html" || { echo "room-mock.js を差し込めませんでした" >&2; exit 1; }
  cp "$ROOT/manual/tools/room-mock.js" "$ROOT/v2db.js" "$WORK/"
  for scene in $ROOM_SCENES; do
    shoot --virtual-time-budget=8000 \
      --screenshot="$ROOT/manual/img/shot-share-$scene.png" "file://$WORK/room.html?room=demo#scene=$scene"
    echo "撮影: shot-share-$scene.png"
  done
}

pdf() {
  mkdir -p "$WORK"
  chrome --no-pdf-header-footer --virtual-time-budget=5000 \
    --print-to-pdf="$ROOT/manual.pdf" "file://$ROOT/manual/index.html"
  echo "作成: manual.pdf"
}

case "${1:-all}" in
  shots) shots ;;
  room) mkdir -p "$WORK"; room_shots ;;
  pdf) pdf ;;
  all) shots; pdf ;;
  *) echo "使い方: $0 [shots|room|pdf]" >&2; exit 1 ;;
esac
