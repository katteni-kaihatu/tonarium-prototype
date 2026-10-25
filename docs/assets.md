# 素材の出典と取得状況

## バイクの効果音（取得未完了）

下記は配布ページのライセンス表記を2026-10-25に確認した候補。音声ファイルは未同梱。今回の作業でもシェルからのダウンロードが接続エラーになった。バイクの効果音の受け入れ条件は未達。

| 用途 | 候補・配布元URL | 作者 | 確認した表記 | ローカルで想定する名前 |
| --- | --- | --- | --- | --- |
| エンジン／走行ループ | [(defect) motor loop](https://opengameart.org/content/defect-motor-loop) の fan_interval.wav | qubodup | License(s): CC0。リンク先は CC0 1.0 | client/public/audio/bike/engine.wav |
| スキッドループ | [Screeching Tires #1](https://bigsoundbank.com/screeching-tires-1-s2368.html) | Dorian CLAIR | CC0 (public domain)。配布ページに編集・再配布可能とも記載 | client/public/audio/bike/skid.wav |
| 乗降 | [Interface Sounds](https://kenney.nl/assets/interface-sounds) から短いスイッチ音を選定予定 | Kenney | License: Creative Commons CC0 | client/public/audio/bike/mount.ogg |

走行音の候補はファンの録音で、簡易バイクのモーター音として使う想定。スキッド音はループに適した区間への編集と試聴が必要。乗降音の具体的なファイルの選定・アーカイブ内のライセンス照合・試聴は未実施。採用時に元のファイル名、編集内容、同梱したファイルのハッシュをこの表に追記する。CC0を確認できないファイルは採用しない。

再生処理は `client/src/view3d/bikeAudio.ts`。同梱ファイルがある場合だけ読み込み、走行中の音量・再生速度を速度で変える。滑り中にスキッドをループし、乗車者IDの変化で乗降音を鳴らす。既存の `fxVolume()` と距離減衰を掛け、音量0では再生を停止する。表示終了時にも全音声を停止する。素材未配置の現状では音声を読み込まず、無音になる。
