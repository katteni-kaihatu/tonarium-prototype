# Firefoxで再読み込み後にマイクの選択・許可を求められる件の調査報告

調査担当：AIbon。再確認日：2026-11-07（Asia/Tokyo）。対象コミット：`948e3ad1e5e916f79073e574bf9082115d2bf064`。調査開始時の追跡対象ファイルに差分はなかった。

## 結論と確認の限界

再許可の原因はまだ特定していない。報告者のOS、Firefoxの版、通常・プライベートの別、サイト権限、データ削除設定、添付、実際の操作順を確認できておらず、本番の再現結果もない。

コードでは、希望する入力機器を端末に保存し、次の取得時に指定する処理がないことを確認した。一方、Firefoxの許可保存はブラウザ側の設定である。許可を保存すれば確認表示を減らせる可能性はあるが、アプリが毎回同じマイクを指定する保証にはならない。Firefoxの選択記憶だけで希望の機器になるかは、報告者の版・設定で比較する必要がある。[Firefoxの権限管理](https://support.mozilla.org/en-US/kb/how-manage-your-camera-and-microphone-permissions)

また、初回接続ではSDKの状態を先に反映するため、storeの初期値 `micEnabled: true` があってもマイク取得へ進まない。これは「接続直後のマイク状態」の説明であり、Firefoxの再許可を引き起こした証拠ではない。更新後の復元では別途マイクを有効にする経路がある。

成果物はこの調査報告のみ。機能追加、挙動修正、依存更新、変更履歴の編集は行っていない。以下のコードから導いた結果は静的な検証であり、Firefoxで観測した結果とは区別する。

## 対象環境とLiveKit版

| 対象 | 確認結果 | 制約 |
| --- | --- | --- |
| リポジトリ | 上記コミット。`CLAUDE.md`、`docs/direction.md`を確認 | 本番配信中のコミットとは照合できていない |
| 依存指定 | `package.json:102` は `livekit-client: ^2.23.0` | 範囲指定だけでは実際の実行版を確定できない |
| ロック解決版 | `package-lock.json:4046` の項目は2.23.0、配布元も2.23.0のtgz | ロックの変更はしていない |
| 調査worktreeのインストール版 | `node_modules/livekit-client/package.json` は存在しない。上位3階層にも存在しない | SDKをローカルで実行して版を照合することはできない。本番の版も未確認 |
| SDK資料 | Room APIの表示はv2.23.0。公式リポジトリの `v2.23.0/package.json` も2.23.0 | APIのソースリンクとタグの行番号に差があるため、以下のSDK行番号はタグのファイルを基準にした。配布物との同一性の実行検証は未実施 |
| 実行環境 | Windows PowerShell。Node/npmはVolta経由 | npm起動時にユーザーディレクトリの作成権限エラー。依存導入や権限変更はしていない |

## コードの確認箇所

行番号は対象コミットのもの。範囲は各入口から同じ関数の終わりまで確認した。

| 参照箇所 | 関数・役割 | 確認したこと |
| --- | --- | --- |
| `client/src/actions.ts:18` | `enterSession` | 既存セッション退出→参加要求→2D状態→同期開始→`connectVoice`。同じセッションなら接続し直さない |
| `client/src/actions.ts:40` | `exitSession` | セッションをnullにし同期を停止。退出要求と`leaveVoice`の終了を待つ |
| `client/src/actions.ts:52` | `withSessionOperation` | 操作を直列化。失敗時に元セッションへ戻す処理も`enterSession`を通る |
| `client/src/actions.ts:79` | `joinSession` | `resumeAudio`後に`enterSession` |
| `client/src/actions.ts:84` | `reconnectForUpdate` | 更新復元から`enterSession`へ |
| `client/src/actions.ts:90` | `leaveSession` | `exitSession`への入口 |
| `client/src/actions.ts:94` | `setMode` | 表示・座標・mode通知の変更。通話切断を呼ばない |
| `client/src/actions.ts:109` | `switchMode` | 表示切替の待ち時間後に`setMode`。Roomを作り直さない |
| `client/src/net/livekit.ts:14` | `room` | `globalThis.__tonariumRoom`をHMR用に再利用。入力機器の指定はない |
| `client/src/net/livekit.ts:73` | `syncParticipants` | voiceがconnectedのときだけ実行。101行でSDKの`isMicrophoneEnabled`をstoreへ反映 |
| `client/src/net/livekit.ts:114` | `attachRemote` | 相手のマイク音声は`addVoice`で空間音声へ。画面共有音声は別の音量処理 |
| `client/src/net/livekit.ts:143` | Roomイベント登録 | 公開・非公開・ミュート等で状態同期。161–175行で再接続・切断を処理 |
| `client/src/net/livekit.ts:179` | `closeRoom` | closing中に`room.disconnect()`。自分の切断による再試行を抑える |
| `client/src/net/livekit.ts:184` | `resetVoiceState` | 受信音声・映像・参加者表示等を片付ける。`micEnabled`自体は直接初期化しない |
| `client/src/net/livekit.ts:198` | `leaveVoice` | 世代更新→切断→表示等のリセット→voiceをoffにする |
| `client/src/net/livekit.ts:218` | `connectVoice` | 世代更新→切断→リセット→トークン取得→接続→`startAudio`→connected→状態同期→マイク条件判定 |
| `client/src/net/livekit.ts:253` | `toggleMic` | 希望値を反転。接続中だけ`setMicrophoneEnabled(next)`、その後SDKの状態を反映 |
| `client/src/net/livekit.ts:265` | `toggleShare` | 画面共有と共有音声の取得はマイクとは別 |
| `client/src/net/livekit.ts:281` | `publishCamera` | 渡された映像トラックを公開。入力マイク選択とは別 |
| `client/src/world/WorldScreen.tsx:155` | `Dock` | 165行のボタンから`toggleMic`、190行から退出。603行の共通Dockを2D/3Dで利用 |
| `client/src/home/Home.tsx:71` | mode操作 | 参加中は`switchMode`、未参加では次の参加modeを保存 |
| `client/src/home/Home.tsx:278` | 参加ボタン | `joinSession`を呼ぶ入口の一つ |
| `client/src/store.ts:275` | `load` / `save` | 端末内のlocalStorageをJSONで読み書き。保存失敗は通知せず今回だけの値になる |
| `client/src/store.ts:289` | 音量の読み込み | `tonarium.audioVol`を読み、402行で各音量を復元 |
| `client/src/store.ts:298` | 初期状態 | joined=false、312行でsession=null、439行でvoice=off、448行でmicEnabled=true |
| `client/src/volume.ts:5` | `setMasterVolume` | 音量更新と`save('tonarium.audioVol', ...)`。相手別の音量・ミュートも端末に保存 |
| `client/src/Profile.tsx:54` | `ProfileDialog` | 言語・更新・描画設定等の既存入口。公開用bio/botのPOSTは78行・84行の別処理 |
| `client/src/updateRecovery.ts:11` | `UI_KEYS` | 更新用snapshotはmicEnabledを含むが機器IDは含まない |
| `client/src/updateRecovery.ts:19` | `prepareUpdate` | WebはsessionStorage、再起動用はlocalStorageへ保存 |
| `client/src/updateRecovery.ts:47` | `readRecovery` | snapshotを読み取り後に削除。有効期限24時間等を検証 |
| `client/src/updateRecovery.ts:64` | `restoreUpdate` | 再参加後、保存時にON・現在OFF・接続成功なら81行で`toggleMic`。最終的に実際の接続結果を残す |
| `client/src/UpdateRecoveryNotice.tsx:10` | `UpdateRecoveryNotice` | snapshotがなければ復元しない。24行で保存時のmicEnabledを先にセットし、27行で復元。36–39行の再試行は受信音声の開始 |

## 呼び出し経路と状態遷移

### 通常の再読み込み

ページ再読み込み→新しいJavaScript環境→新しいstoreとRoom。HMRのグローバル保持は同じページ内でのモジュール差し替え用であり、通常の再読み込みを越えてRoomやトラックを保持しない。更新用snapshotがなければ`UpdateRecoveryNotice`は復元しない。storeはsession=null、voice=offから始まり、通常の参加操作が`joinSession → enterSession → connectVoice`を通る。

`connectVoice`は毎回`closeRoom → resetVoiceState`を行う。接続が成功し`startAudio`が終了するとvoiceをconnectedにして`syncParticipants`を実行し、その後に`get().micEnabled`を判定する。SDKにマイク公開がない初回は`isMicrophoneEnabled=false`なので、trueだった初期値はfalseに上書きされ、有効化を飛ばす。接続後に利用者がDockのマイクを押すと`toggleMic → setMicrophoneEnabled(true)`から初めて取得・公開する。この順序から「再読み込みだけで必ずマイク許可を求める」とは説明できない。実際にどの操作の直後に表示されるかが必要である。

### 更新後の復元

`prepareUpdate → ページ更新 → readRecovery → UpdateRecoveryNotice → reconnectForUpdate → enterSession → connectVoice → restoreUpdate`。保存時のON値を先にstoreへ戻しても、接続時の状態同期でOFFになる。その後`restoreUpdate`が保存値と実状態を比較して`toggleMic`するため、保存時にONなら再取得が起こり得る。保存時にOFFならこの追加取得はしない。保存するのは希望のON/OFFであり、ブラウザの許可や選択機器ではない。自動復元時の取得が利用者の更新操作とどう結び付くかも実機で観測する必要がある。

### SDK内の再接続

アプリの`connectVoice`を通らない。`Reconnecting → voice=connecting`、`Reconnected → voice=connected → syncParticipants`。アプリは`SignalReconnecting`を購読していないため、信号だけの再接続ではconnecting表示にならない場合がある。

SDKには信号接続の再開と、トラックを再公開する完全な再接続がある。後者は取得し直す経路を持つ。したがって「同じRoomなら取得は起きない」とは扱わない。再接続後は残っている公開・ミュート状態をstoreへ同期し、ここではstore初期値による再有効化を行わない。[SDK Roomの再接続処理](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/Room.ts)

### 切断後にアプリが接続し直す場合

`Disconnected`で自分の切断ではなく、セッションが残っていればvoice=unavailableにし、3秒後に`connectVoice(sid)`。世代とセッションが同じ場合だけ実行する。SDKの切断ではローカル公開とトラックが片付くため、その後の接続は初回同様に公開なし→状態同期でOFFとなる経路になる。意図したON状態が自動で戻らない可能性と、ブラウザの確認表示が出る理由は別である。接続失敗時のイベント・並行操作による差は実機未確認。

### セッション移動・退出

別セッションへ参加→`enterSession → exitSession → leaveVoice → closeRoom → resetVoiceState → off`→新しい参加要求→`connectVoice`。Roomオブジェクトを再利用しても`disconnect()`でトラックは停止し、公開は残らない。同じセッションの参加ボタンでは早期returnする。退出中はsession=nullなので自動再接続せず、世代更新も古い接続結果・タイマーを抑える。

### 2D/3D切り替え

`switchMode → setMode`のみで、上記の切断・取得は呼ばない。共通Dockと共通Roomを使い続ける。切り替えと同時に通信断や別のカメラ操作が起こる場合は別に記録する。「2D/3Dの切り替えが直接マイクを取り直す」という説明は、この経路では否定できる。

## SDK 2.23.0の機器取得・停止・切り替え

以下は公式タグのソースを読んだ結果で、ブラウザで実行した結果ではない。SDK行番号はリンク先のファイル内の1始まりの行番号。

| 処理 | 使用版の根拠と意味 |
| --- | --- |
| 状態と取得 | `Participant.ts` 207行の`isMicrophoneEnabled`は公開なしならfalse。`LocalParticipant.ts` 450・508・652行の`setMicrophoneEnabled / setTrackEnabled / createTracks`は、既存公開なら解除、なければ取得・公開する。Roomの取得既定値と呼び出し側の指定を合わせる。[Participant](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/participant/Participant.ts)、[LocalParticipant](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/participant/LocalParticipant.ts) |
| 初回の制約 | `defaults.ts` 23行では入力の既定は`ideal: default`。アプリは機器を指定していない。`create.ts` 49–150行では文字列IDを一旦exactにし、失敗時にidealで再試行する。取得後の実deviceIdをトラックの制約へ戻すが、アプリの永続保存ではない。厳密な機器固定を製品仕様にするなら、単純な文字列指定による別機器への切り替わりを避け、結果を確認する必要がある。[defaults](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/defaults.ts)、[create](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/create.ts) |
| 一覧取得 | `DeviceManager.ts` 23–68行はまず列挙し、空の一覧・ラベルなら既定で`getUserMedia`を呼び、再列挙して一時トラックを停止する。`Room.getLocalDevices('audioinput', false)`ならその権限取得をしないが一覧は不完全になり得る。一覧を表示するだけのつもりでも、既定引数なら確認表示を生む可能性がある。[DeviceManager](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/DeviceManager.ts) |
| 通話中の切り替え | `Room.ts` 1503行の`switchActiveDevice('audioinput', id)`は既定exact=trueで取得既定値とマイクトラックへ反映する。`LocalTrack.ts` 265・358行では再取得前に古いトラックを停止するため、失敗時に以前の音声が必ず残るとは言えない。戻り値falseと例外をともに処理し、実トラックの設定で適用を確認する。[Room](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/Room.ts)、[LocalTrack](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/LocalTrack.ts) |
| ミュート中の切り替え | `LocalTrack.setDeviceId`はミュート中は制約とpendingDeviceChangeを更新して成功を返し、即取得しない。`LocalAudioTrack.ts` 69行の`unmute`で必要なら再取得する。したがってミュート中の成功は機器が使えることの確認ではない。[LocalAudioTrack](https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/LocalAudioTrack.ts) |
| ミュートと停止 | 既定`stopMicTrackOnMute=false`。通常のミュートは音声送出を止め、取得済みトラックは維持する。終了済みトラック、選択変更、完全な再接続では再取得があり得る。`disconnect`のstopTracks既定はtrue、`handleDisconnect`は公開一覧も空にする。[Room API](https://docs.livekit.io/reference/client-sdk-js/classes/Room.html) |
| SDK再接続 | `Room.ts` 648–674行で信号再開、1812行で完全な再接続後の再公開。`LocalParticipant.republishAllTracks`（1618行）は未ミュートのSDK管理トラックを再取得する分岐を持つ。単なる信号再開とは異なる |
| 機器取り外し | `LocalParticipant.ts` 1996–2075行の終了処理では、Firefox等はまず再取得し、機器取得に関する失敗なら許可拒否・手動停止等を除いて列挙した機器で再試行する。失敗時はミュート。ミュート中は解除まで取得しない場合がある。希望機器の維持は保証しない |
| 受信音声 | `Room.startAudio`（1414行）は相手の音声要素の再生とAudioContextの開始を扱う。マイクを取得する処理と分ける。アプリの236行や復元通知の再試行を、マイク許可の要求と同一視しない |

アプリの`client/src`全体で`getLocalDevices / enumerateDevices / switchActiveDevice / audioCaptureDefaults / deviceId / setMicrophoneEnabled`を検索した。該当するマイク有効化は`livekit.ts`の245・258行で、引数に機器指定はない。機器一覧・切り替え・機器ID保存のアプリ処理は見つからなかった。ただしSDK内の機器監視・内部呼び出しは別であり、「SDKも一切列挙しない」とは結論しない。

## 許可保存と機器選択保存の違い

| 条件 | 許可について | 希望機器について |
| --- | --- | --- |
| 通常モード・一時許可 | 次回取得で再確認となる候補。再読み込み・再起動を比較する | 今回選んだ機器が次回も使われるかは別途確認 |
| 通常モード・保存した許可 | Firefoxの確認画面で「この設定を記憶する」に相当する項目を選び、設定→プライバシーとセキュリティ→マイクで対象サイトが許可になっているか確認 | アプリ側の機器指定は増えない。ブラウザが選択をどう再利用したかを実トラックで確かめる |
| プライベート | 通常モードとの保存を同一視しない。最後のプライベートウィンドウを閉じて再度開く試験を分ける。記憶項目の提供・持続も対象版で確認 | deviceIdは別で、セッションを越えて持続しない |
| サイトデータ削除・終了時削除 | どの項目を削除したかを記録する。サイト権限とCookie等の削除を混同しない | Cookie削除でdeviceIdが変わり、端末保存値も失われる可能性がある |
| オリジンが異なる | scheme・host・portが違うアクセス先を同じサイトとして比較しない | deviceIdもオリジンごと。別端末や別ブラウザのIDを流用しない |
| OSのマイク権限 | ブラウザ側で許可済みでもOSの拒否・機器障害を別に確認する | 保存IDではOS側の制約を回避できない |

Firefoxの許可管理の根拠は[Mozillaの手順](https://support.mozilla.org/en-US/kb/how-manage-your-camera-and-microphone-permissions)。プライベート終了時のデータの扱いは[Mozillaの説明](https://support.mozilla.org/en-US/kb/private-browsing-use-firefox-without-history)。deviceIdのオリジン単位の持続、Cookie削除によるリセット、プライベート時の違いは[MDN deviceId](https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/deviceId)を参照した。許可・機器障害の区別は[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)を参照した。

一覧・ラベルにも制約がある。列挙にはHTTPS等の安全な環境と表示中の文書が必要で、許可のない機器は一覧に出ない場合がある。ラベルは取得中または保存した許可がある場合に利用でき、取得前の空ラベルを「機器なし」と扱わない。[MDN enumerateDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)、[MDN label](https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/label)

許可保存だけで解決する範囲は、同じサイト・通常モードで保存許可が有効で、ブラウザが選ぶ機器でも目的を満たす場合の確認操作である。複数マイクから希望の一台をアプリとして選び続けるには、機器IDの端末内保存と取得前の指定、適用結果の確認が対応案になる。それでも権限拒否、取り外し、ID変更、保存不可は解消しない。

## 原因候補ごとの検証表

「静的確認」はコード・資料の照合結果。「未実施」は報告者のFirefox、本番操作、マイクにアクセスできないため。期待する観測は検証前の予測であり実測値ではない。

| 原因候補 | 根拠 | 検証手順と期待する観測 | 実際の結果・未実施理由 | 否定できた範囲 | 未解決事項・必要な証拠 |
| --- | --- | --- | --- | --- | --- |
| 一時許可の再確認 | Firefoxに許可を記憶する選択がある | 通常モードで一時許可と保存許可を比較。保存側だけ再取得時の表示が減れば支持 | 資料確認のみ、実機未実施 | アプリの機器保存を足せばブラウザ許可も保存できる、という説明は不可 | 保存状態、各取得操作直後の確認有無 |
| プライベート・終了時削除・異なるサイト | 許可とデータの保存条件、IDのオリジン依存 | 一要因ずつ変え、再読み込みと完全終了後を比較。終了・削除・サイト差と現象が対応すれば支持 | 環境情報・実機なし | HMR用のRoom保持ではこれらを解決しない | 通常/プライベート、実際のscheme/host/port、削除対象 |
| 希望の機器を再指定していない | アプリに機器ID保存・指定なし | 複数マイクA/BでBを選び、再取得後に実トラックがBか照合。許可表示がなくてもAなら機器選択の問題 | 保存・指定なしを静的確認。実機未実施 | 現アプリが保存済み機器IDを誤って指定する原因はない | ブラウザの選択と実トラック一致の有無 |
| 接続時の同期順序 | `connectVoice`238行が243行より先 | 新規Roomで公開なしを前提に追跡。同期後falseとなり取得分岐を飛ばす。復元ONでは後段toggleで取得する予測 | SDKのgetterと呼び出し順を静的確認。実行未検証 | store初期値trueだけで毎回自動取得する、とは言えない | 操作前後のvoice/micEnabled/公開の有無、通常更新かアプリ更新か |
| 切断・再接続に伴う再取得 | SDKの完全な再接続やアプリのdisconnect経路 | 信号再開、完全な再接続、切断後3秒再接続を分け、取得回数と確認表示を比較 | ソース確認のみ。通信断試験を行える本番環境なし | SDK内再接続が常に新規Roomを作る、という説明は否定 | 接続イベント順序、マイクトラックが入れ替わったか |
| 一覧取得による確認 | `getLocalDevices`のrequestPermissions既定true | 検証用環境で利用者が選択画面を開く操作からfalse/trueを比較。ラベルなし時にtrue側で確認が出る予測 | SDK分岐を確認。現アプリに直接呼び出しなし。実機未実施 | 現アプリ独自の機器一覧画面が毎回確認する原因は見つからない | SDK内部の列挙・取得の時点、将来の設定画面での取得回数 |
| ミュート解除・機器の終了 | 通常はトラック維持、終了/選択変更で再取得 | 通常のON→OFF→ONと、OFF中の取り外し→ONを比較。後者だけ再取得なら支持 | SDK分岐のみ確認。複数機器なし | 通常ミュートが毎回トラックを停止する、とは言えない | ended/live、pending選択、拒否時のエラー種別 |
| OS権限・利用不能 | ブラウザ許可とは別に取得が失敗し得る | OSでFirefoxへの許可、機器接続、他アプリ使用状況を確認。失敗名だけ記録 | OSとFirefox版不明、未実施 | アプリ保存だけでOS拒否を直せる、という説明は不可 | OS名・版、エラー種別、許可状態 |
| 2D/3Dや受信再生との混同 | mode経路に切断なし、startAudioは受信処理 | 同一セッションで切替のみ行い、取得が増えないことを確認。受信開始のクリックと許可画面も別記録 | コード経路を静的確認、実機未実施 | 切替処理自身の直接取得、startAudio自身によるマイク取得は確認したコードでは否定 | 同時に起きた通信断・更新・別の取得操作 |

## 利用者が試せる設定と本番の再現手順

これは実施依頼用の手順であり、調査担当が本番で実施済みという意味ではない。聞き取り済みの不明点は推測で埋めず、以下の記録を次の証拠とする。

1. OS名・版、Firefoxの正確な版、通常/プライベート、対象サイトのオリジン、許可保存状態、終了時のCookie・サイトデータ・サイト権限の削除設定を記録する。添付は未確認なので、再現の操作順を文章で記録する。
2. 通常モードの同じサイトで、自分の通話開始またはマイクON操作から許可する。まず記憶を選ばない条件で、通常の再読み込み→参加→必要ならマイクONを実施する。表示時点と、選んだ機器を記録する。
3. 許可状態を対象サイトだけで変更し、同じ操作を「記憶する」を選んだ条件で繰り返す。設定のマイク一覧でも保存許可を確認する。自分の操作でマイクを停止してからFirefoxを完全終了し、再起動後にも同じ比較を行う。
4. OSの希望マイクを既定にする案も比較できる。ただし他アプリにも影響するため元の設定を控える。Firefoxで希望機器を選べても、実際の使用機器が一致するかを次項の方法で確認する。
5. 可能ならマイクA/Bを用意し、Bを選んだ後の再読み込み・再起動を比較する。通話中のB取り外し、OFF中の取り外し→ON、サイト許可取り消し→自分でON、通常ミュート解除、別セッションへの移動、同じセッションの2D/3D切替を一件ずつ行う。プライベートは別の試験とし、最後のウィンドウを閉じた後も比較する。
6. アプリの更新後復元は、通常のF5とは別に扱う。保存時ON/OFFを分けて、復元直後の確認表示とマイク状態を記録する。ネットワークの再接続試験は本番の他の利用者へ影響しない検証環境で行う。

実際の入力は、開発者が手元でローカルマイク公開の `track.mediaStreamTrack.getSettings().deviceId` と、許可後のaudioinput一覧を照合して確認する。`room.getActiveDevice`や選択UIだけを使用機器の証拠にしない。元のID・機器名は手元だけで扱い、共有する結果は「希望Bと一致/不一致/取得なし」、`readyState`、ミュート状態、エラー名、確認表示の有無と時点に絞る。追加の`getUserMedia`を診断目的で勝手に呼ばず、一覧の照合も権限を新たに要求しない方法で行う。

| 記録欄 | 初回の自分のON操作 | 通常再読み込み後 | Firefox完全終了・再起動後 |
| --- | --- | --- | --- |
| 通常・一時許可 | 未実施 | 未実施 | 未実施 |
| 通常・保存許可 | 未実施 | 未実施 | 未実施 |
| プライベート（別枠） | 未実施 | 未実施 | 未実施（最後のプライベートウィンドウ終了後） |

各欄に「許可表示の有無／自分が行った操作／希望Bとの一致／マイクON/OFF／エラー名」を記入する。再読み込み後にマイクOFFなら、確認が出なかっただけで許可保存が成功したと判定しない。次の自分のON操作で確かめる。

## 対応案と制約（製品仕様は未確定）

現段階の推奨は案1で原因を絞ること。希望機器が保存許可だけでは再利用できない証拠が出たら案2を提案する。実装の承認は今回の調査依頼に含まれない。

| 案 | 内容 | 適用範囲・制約 |
| --- | --- | --- |
| 1：許可設定の確認と比較（現段階の推奨） | 上記手順で通常モードの保存許可と実入力を確認する | 確認表示だけの問題ならアプリ変更なしで減らせる可能性。希望機器の再指定は保証しない |
| 2：既存設定から端末内の機器選択を保存 | `ProfileDialog`を入口にし、storeのload/saveと共通livekit処理を広げる | 公開プロフィールのbio等へ保存しない。端末・ブラウザ・オリジン単位。ブラウザ権限は保存できない |
| 3：選択した機器が使えないときは利用者が再選択 | 案2に加え、取得を止めて機器選択を案内する | 希望と違うマイクで通話することを防ぎやすいが、取り外し・ID変更時に手間が増える。既定へ戻す案との製品判断が必要 |

案2の適用順は、端末の保存値を読み検証→マイク取得前にRoomの入力既定または最初の有効化引数へ適用→接続→利用者の通話開始意図・ミュート状態に沿って取得→実トラック照合→成功した選択を保存、となる。取得後に切り替えると、最初に別機器を取得することになるため避ける。`syncParticipants`に上書きされる実状態と、利用者が希望したON/OFF・機器選択は分けて設計する必要がある。

初回・セッション移動・切断後の`connectVoice`だけでなく、更新復元の`toggleMic`にも同じ選択を適用する。SDK内の完全な再接続ではトラックの制約が使われるため、通話中の切り替えをトラックと取得既定の両方へ反映し、再接続後に確認する。通常のミュートを解除するだけでは、既存公開への`setMicrophoneEnabled`の追加引数で機器を切り替えられない。共通処理で`switchActiveDevice`を使う案を検証する。

| 失敗条件 | 既定マイクに切り替える案 | 再選択を求める案・共通の扱い |
| --- | --- | --- |
| 保存機器がない・IDが変わった | 続けやすいが、意図しない入力になり得る。切替を表示して実機器を確認 | マイクをOFFのまま選択を案内。空一覧だけで不在と決めず、許可不足も区別 |
| 権限拒否 | 既定へ変えても解決しない | 自動で繰り返し要求せず、利用者の再操作と設定確認へ |
| 保存不可・保存値の破損 | 今回だけの選択は利用可能 | 現在のsaveは失敗を隠すため、「保存できた」と表示しない仕組みが必要。loadの型引数だけでは値の検証にならない |
| 通話中の切替失敗・戻り値false | SDKの既定値の巻き戻しだけでは古いトラックの復帰を保証しない | 実状態を反映して失敗を表示。安全なミュートと明示的な再取得・再選択を検討 |
| OFF中の切替 | 解除まで使用可否が確定しない | 選択保留と適用済みを混同せず、解除時の失敗も扱う |
| 取り外し・再接続 | SDKが別機器に替える可能性がある | 希望の保存値を自動で別機器へ上書きせず、希望と実入力の差を表示する案を検討 |

「既定へ自動で戻す」と「OFFにして再選択する」のどちらにするか、希望機器を固定するか優先候補とするかは、PMの承認が必要である。通話開始時のON/OFF復元の変更も、既存利用者の挙動を変えるため別途承認する。

### 実装を提案する場合の影響範囲

- 候補箇所は`client/src/Profile.tsx`、`client/src/store.ts`、`client/src/net/livekit.ts`、`client/src/actions.ts`、`client/src/updateRecovery.ts`、`client/src/world/WorldScreen.tsx`。表示文言は`client/src/i18n/ja.ts`、`client/src/i18n/en.ts`、`client/src/i18n/ko.ts`をそろえる。必要なら復元通知も確認する。
- 2D/3Dの共通通話処理を使い、表示ごとの別Room・別マイク管理は作らない。機器の切替でミュートが勝手に解除されないことを確認する。
- 空間音声と相手別・全体音量は受信側の既存処理を維持する。入力選択のために受信音声を切り直さず、二重再生や距離による音量への影響を確認する。
- カメラは映像、画面共有は共有映像と共有音声として別に扱う。`audioinput`のマイクだけを対象にし、切替によるカメラ停止・画面共有停止、共有音声の取り違えがないことを検証する。
- 既存SDKと端末保存を利用できるため、追加依存が必要という根拠は見つかっていない。公開プロフィールAPIやサーバーの保存項目を増やす必要はない。

## 公式資料・SDKソースと確認日

すべて担当者が2026-11-07に再確認。依頼文にある同日参照済みという記録とは別に、今回URLを開いて内容を照合した。一般資料は実機のFirefox版を保証しない。

| 資料 | URL・対象 |
| --- | --- |
| Firefoxの権限管理 | https://support.mozilla.org/en-US/kb/how-manage-your-camera-and-microphone-permissions |
| Firefoxプライベート | https://support.mozilla.org/en-US/kb/private-browsing-use-firefox-without-history |
| MDN deviceId | https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/deviceId |
| MDN label | https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo/label |
| MDN enumerateDevices | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices |
| MDN getUserMedia | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
| LiveKit Room API | https://docs.livekit.io/reference/client-sdk-js/classes/Room.html （表示v2.23.0） |
| タグの版表示 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/package.json |
| Room | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/Room.ts |
| 機器一覧 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/DeviceManager.ts |
| 参加者の状態 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/participant/Participant.ts |
| ローカル公開 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/participant/LocalParticipant.ts |
| 取得 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/create.ts |
| トラックの切替 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/LocalTrack.ts |
| マイクのミュート | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/track/LocalAudioTrack.ts |
| 既定設定 | https://raw.githubusercontent.com/livekit/client-sdk-js/v2.23.0/src/room/defaults.ts |

## 検証結果と次に必要な証拠

コード・資料の照合では、機器選択の端末保存がないこと、接続時の状態同期が有効化条件より先であること、通常再読み込みとHMR・更新復元・SDK内再接続の経路が違うことを確認した。原因をFirefox、SDK、アプリのいずれかに断定するだけの実測結果はない。

機械確認では、PowerShellで本文から抽出したコード参照34箇所のファイル・行の存在、必須項目20項目の記載、package指定とロック版、接続時の同期と条件判定の順序を確認し、すべて通過した。参照行の内容も読み直して関数との対応を照合した。Gitの差分確認では変更履歴に変更がなく、追加ファイルはこの報告書だけだった。これは報告の記載・参照確認であって、マイク動作試験ではない。

`npm run check:completion`は実行を試みたが、Voltaがユーザーディレクトリを作成できず起動前に失敗した。履歴チェック、翻訳チェック、型チェック、ビルドの成功は確認できていない。Pythonの`python3 / python / py -3`も見つからず、yomiyasuの自動検査は未実施。文章は事実・仮説・条件を保つ観点で目視確認した（`yomiyasu-check: not_run reason=no_python`）。

実機確認は全件未実施。本番URL・ログイン状態・Firefox操作環境・報告者の機器を利用できず、添付も今回提供されていないため。SDKのローカル実行も依存未導入と実行環境の制約で未実施。資料照合にはWeb参照を用いた。ネットワークを使う依存導入や、無断のマイク取得は行っていない。

次に必要なのは、上記の本番記録表と環境情報、確認表示が出る直前の操作、希望機器と実入力の一致結果、本番の配信コミットと解決されたSDK版である。まず一時許可と保存許可を同条件で比較する。保存許可で確認だけが減り、機器が戻らないなら機器選択保存を別案件としてPMへ返す。再現しない場合も、そのときの条件を残し、未確認の報告条件との差を次の検証対象にする。
