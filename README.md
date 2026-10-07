# AkaDako Multi Logger(β)

AkaDako / S-LINK センサーボードの値をブラウザでリアルタイムに表示・記録する、1ファイル構成の教材用Webアプリです。

## 機能

- Web MIDI 経由で AkaDako / S-LINK ボードに接続
- センサー14項目: 温度・照度・距離・湿度・気圧・重力・傾き・動き・音量・水温・酸素・電流・電圧・電力
  - 「動き」はパソコンのカメラ、「音量」はマイクを使うため、ボードなしでも測れます
- 記録していないときも現在値を1秒ごとに更新
- グラフ表示と表表示の切り替え
- CSV ダウンロード / TSV コピー（Excel・スプレッドシートに貼り付け）
- 「AI」タブで AI 計測: 記録間隔（5秒/10秒/1分/10分）ごとにカメラの画像とプロンプトを AkaDako 生成AI に送り、答えの数字を表・CSV に記録（回答文も一緒に残ります）
  - 利用には S-LINK ボードの接続と、[AkaDako Cloud Plus のアクセスコード](https://699.jp/cp) の登録が必要です
  - アクセスコードの Cookie は xcratch.699.jp のものなので、同一サイトになる https://log.699.jp/ から開いてください

## 使い方

1. https://log.699.jp/ を開く（手元で動かすときは `index.html` を `https://` か `localhost` 経由で開く）
2. 「ボードに接続」で S-LINK ボードに接続
3. センサーのタブを選び、「記録をはじめる」で記録を開始

外付けの機器が必要なセンサー（水温・酸素・電流・電圧・電力）は、タブを押したときに接続先の案内が出ます。

## 動作環境

- Web MIDI API に対応したブラウザ（Chrome、Edge など）
- iPad は Safari / Chrome に Web MIDI が無いため、Scratch専用ブラウザ [Scrub](https://apps.apple.com/jp/app/scrub/id1569777095) で開いてください。iPad の通常ブラウザで開くと「Scrub で開く」の案内が出ます（`scrub://openUrl?<このページのURL>` で Scrub に渡します）。PC で案内の表示を確かめるには `?preview=ipad` を付けます
- AkaDako / S-LINK センサーボード
- カメラ・マイクを使う項目は `https://` または `localhost` での配信が必要です（`file://` では許可されない場合があります）
