# Chrome起動直後の操作不能についての調査

今回の調査では、利用者のChromeで起きた原因は特定していない。隔離した合成データでは、AD開始時の例外が通常のWebSocket接続を妨げる経路と、極端な進行値で自動購入が長い同期処理になる経路を確認した。前者は接続できない状態、後者は画面の処理を長く占有する可能性がある状態であり、同じ症状として扱わない。修正は実施していない。

## 利用者の申告と調査の境界

クラッシュ後、普段のChromeで起動直後から全体を操作できない、という依頼を受けた。別ブラウザは動作するとの情報があるが、同じMisskeyアカウントだったかは未確認。端末・OS・Chromeの版、直前の操作、保存状態、最初のエラー、添付内容も未確認である。「Chrome固有」「アカウント固有」「ADが原因」とは断定しない。

コード確認対象と開始時HEADは `29b78f5f6ca0c5e3302b6960ae2e3ffaf5cda88c`。開始時点でWindows配布ZIPが2本、変更ありと表示された。今回の作業前から存在する差分として、パス・状態・SHA-256をJSONの `changeAudit.baseline` に記録した。通常の `git status` はGit LFSがworktree外へ書こうとして失敗したため、LFSフィルターを無効にした読取用コマンドで状態を取得した。ZIPは変更していない。対象以外の版へ切り替えず、確認した各ソースのハッシュを対象コミットと照合する。

成果物はこの報告、同名JSON、隔離調査スクリプト、報告検査スクリプトの4ファイルだけ。製品コード、依存、既存テスト、変更履歴は変更していない。本番サービスを起動・利用せず、通信はモックし、保存は合成値を入れたMapだけを使った。サーバーの既存単体検査だけはテスト用の一時フォルダへ書き込む。利用者の保存データ・アカウント・ブラウザプロファイルにはアクセスしていない。

## コード上の観測

### 起動と例外の伝播

`main.tsx` のモジュール読込で共通ストアを作る。この時の `createAdSlice()` は保存先を取得して関数と初期値を作るだけで、進行の選択・復元・定期処理は開始しない。`startContentTranslations()` は非同期取得を開始し、応答を待たず `App` を描画する。言語初期化の保存読取は保護されている。

通常のログイン済み起動は `App` のeffect → `resume()` → `fetchAuth()` → `enter()` → `adBindTonarium()` → `adStart()` → `connectWs()` の順。研究所を開く操作は不要。`fetchAuth()` は `/auth/me` の取得・JSON解析を待ち、独自の中断期限は設けていない。

`enter()` は先に `joined=true` を設定する。続くAD開始の同期例外を捕捉する処理がなく、例外が起きると直後の `connectWs()` へ到達しない。`resume()` のPromiseは拒否され、Appは認証情報を未ログイン相当へ置くが、すでに設定した `joined` は戻さない。表示分岐は `joined` を優先するため、セッションがなければHomeへ進み得る。2回目の `enter()` は参加済みガードで戻る。この構造は「処理が無限に回る」こととは異なる。接続モックが呼ばれないことまでを実測し、Homeの実操作は検証していない。

### 保存・進捗選択・同期

`adStart()` は開始済みフラグ設定 → 保存先取得 → 復旧記録整理 → `prepareProgressSelection()` → プロフィール列挙 → 紐付け → `loadProfileGame()` → 定期処理登録の順。復旧記録整理の例外だけはここで捕捉する。選択準備では保留接続を完了し、選択情報・旧ゲスト保存・候補を読む。JSON解析、想定型へのアクセス、保存の例外が伝播し得る。開始済みフラグは途中失敗でも戻さない。

`safeStorage()` が捕捉するのは `localStorage` 参照と `__ad_probe__` の読取のみ。返した保存先の後続操作を包む仕組みではない。書込可能か、全キーが読めるか、JSONや索引の形が正しいかは保証しない。

`loadProfileGame()` のセーブ読取・`deserialize()`・比較基準のJSON解析にはcatchがあり、失敗するとゲームをnull、ADをerrorにして戻る。これだけなら通常のWS接続は続く。`connect()` 内の接続情報解析と接続作成、`resolveServer()` 内のサーバー読込・検証・比較・復旧記録保存・`adopt()` の失敗も非同期のcatchでAD errorへ移る。

`resolveServer()` はサーバーの版・比較基準・取り込み保留・前回選択を使い、採用する保存値か選択待ちを決める。`adopt()` は読込 → 必要時のオフライン計算 → 直列化と比較 → ローカル保存・比較基準保存 → readyの順。ここに長い同期処理があれば、API取得後でも画面の処理を占有する。選択・復元は明示操作の経路でも保存・バックアップ・一覧取得を行う。`listProgressSources()` は各プロフィールの本文と復旧本文をJSON解析するため、起動が通っても後の画面表示時に失敗し得る。adapterはこの一覧を取得する。

復旧記録はプロフィールごとに20件を残す。起動時に全キーを調べ、プロフィールごとの索引・旧記録も探す。件数と保存全体の量で走査負荷が増える。整理中の書込失敗を捕捉しても、後の一覧・同期・保存が安全になるわけではない。今回は利用者環境の整理を実行していない。

ADの `frozen()` は移行中、loading、choiceで進行・購入・保存などを止める条件。Appの共通表示を丸ごと入力不可にする条件ではない。100ms処理は `tick`、自動購入、救済、直列化比較、版通知を同期実行する。1秒処理はローカル保存、30秒処理は再接続・読込比較・必要時の保存とスコア・ランキング更新を行う。1秒保存失敗は記録して戻る。100msの計算自体には同じcatchがない。

### 計算の上限と上限の内側

`deserialize()` は8次元を固定件数で読み、数値や自動購入を正規化する。`sanitizeInt()` は有限値の整数化で、安全な整数の上限には切り詰めない。自動購入の段階は最大5へ制限する。`validateSave()` の許容範囲とも区別が必要である。巨大な有限指数や、余分な長い文字列は別の負荷として残る。

`offlineProgress()` の経過時間は8時間、チャンク数は最大1000。各チャンクで `tick()` と `runAutobuyers()` を同期実行する。`tick()` は8次元の産出と実績を計算する。自動購入は長い時間でも各種類1回だが、1回の購入処理は複数回の購入を含む。`buyMaxDimension()` は1次元につき最大100000回、`buyMaxTickspeed()` も最大100000回。4次元ずつの購入とこれらの処理が各チャンクで重なる。Boost、Galaxy、Infinityは購入より前に実行し、資金と次元をリセットし得るため、同じ資金でも設定次第で負荷が変わる。

手動の `buyMax()` には外側1000回のガードがあるが、内側のtickspeed購入whileは個別の件数ガードを持たない。今回の起動経路では自動購入用の上限付き処理を使っており、この手動経路を起動停止の実測結果へすり替えない。数値の正規化自体は算術・固定件数の処理で、今回確認した範囲に経過時間分の無制限な正規化ループはない。JSON直列化・キーを並べた比較は保存量に応じて増える。

### AD以外と入力の遮断

翻訳応答のJSON解析、カタログ走査、署名文字列生成と購読通知はメインスレッド上で行う。取得には10秒の中断信号があるが、巨大な応答を解析する同期負荷まで止めるものではない。実環境の応答量は未確認。

WSは生成後のcloseで最大5秒までの再接続を行い、4401では再読込、互換性不一致では再接続しない。初回の `connectWs()` 自体が呼ばれなければ、この再接続も開始しない。セッション要求には15秒、更新復元の待機には既定20秒の期限がある。いずれも同期処理が詰まれば同じスレッドのタイマーは遅れる。

更新復元の保存読取は通知コンポーネント側のcatchで説明画面を出す。Webでは主にタブのsessionStorage、Electronでは再起動用localStorageも読む。更新設定の不正JSONは既定値へ戻る。`UpdateBanner` では設定関数へ渡す `localStorage` 参照そのものが、関数内のcatchより先に評価される点も静的な候補として残す。

`CompatOverlay` と `MaintenanceOverlay` の `.maintenance` は固定全面、z-index120で入力を受ける。保守表示は未接続から5秒後にhealthzを調べ、通信失敗時に出る。healthz取得自体の独自タイムアウトはない。ADの確認画面は固定全面、z-index100で、明示的に呼ばれるとbody直下へ作られ、終了後のmicrotaskで削除される。更新復元の `.modalbg` も固定全面。透明化していても要素が入力を受ける場合や、親のpointer-events、disabled、拡張機能のDOM/CSS変更は、現物の要素を見ないと区別できない。

現在の `public/sw.js` は通常の資産キャッシュを作らず、navigateだけをネットワークへ渡し、障害時に案内を返す。ただし影響Chromeで実際に動くSWの版、以前のSW、HTTPキャッシュ、拡張機能による応答変更は確認していない。既存 `test-ad-browser.mjs` はAD専用ページとCSS注入の検査であり、全体起動を確認した証拠には使っていない。

## 再現実測と再実行

各ケースは別のNodeプロセス。親はwall-clockの制限時間を持ち、子の終了を待って記録する。意図的な同期無限ループの `watchdog-spin` を750msで終了できることも確認した。対象処理と同じスレッドのタイマーだけで停止を監視していない。タイムアウト時の最後の段階はIPC通知から得るため、関数内部の正確な行までは示さない。

通常は固定時刻1800000000000、決定的な連番ID、シード1相当の生成条件を使用。プロフィール1件と固定保存値が基準で、特定ケースだけプロフィール1000件、復旧記録2000件、保存文字列2000000文字へ変える。数値の極端値は指数10000000、自動購入段階5。実件数と保存文字数はJSONの `inputStats`、タイムアウト時は `lastObservation.inputStats` に残す。文字数はUTF-16単位で、実際のブラウザ保存容量や通信バイト数と同じではない。サーバーのPOST本文上限は1000000バイトであり、2百万文字のモック成功を本番保存成功の証拠にはしない。

`huge-no-auto` と `huge-auto` は同じ8時間経過・極端な資金で、自動購入設定を変える比較。後者は購入系だけを有効にして、先行するリセットで資金が消えない条件にした。さらに同じ条件のtick・自動購入1回・直列化比較を個別に測った。1回の自動購入は終了したが、全体は2500msで終了せず初回同期中に親が終了した。「無限ループを特定した」とは報告しない。

100ms、1秒、30秒は登録したコールバックを各1回呼び、初回同期との間で状態を観測した。readyになるケースでは100ms処理を100回まとめて測り、直列化比較も別に測った。状態通知は含むがReact描画は含まない。ネットワーク保留ケースは5秒中断を発火する前のloadingを観測し、timeoutケースは捕捉した中断コールバックを手動で発火した。実時間5秒の確認ではない。通信先は全てモックし、WSも呼出回数だけのモック。authのHTTP取得とReactのApp起動は単体ハーネスに含めていない。

再実行はリポジトリ直下で次を使う。最初のコマンドは既存JSONの開始時監査情報を保持し、隔離ケースとNodeで動く既存検査を更新する。特定ケースだけなら `--cases huge-auto,engine-huge-autobuy` のように指定できる。Node26の旧型変換試行は記録を保持するための失敗経路で、通常の一括実行には含めていない。

```text
node scripts/investigate-chrome-startup-freeze.mjs
node scripts/investigate-chrome-startup-freeze.mjs --checks
node scripts/check-chrome-startup-freeze-investigation.mjs
```

各runの完全なコマンド、Node・OS版、固定条件、制限時間、実測時間、終了コード・シグナル、状態遷移、例外とスタックは同名JSONにある。ブラウザ検証は未実施で、版も未確認。単体検証の成功をChrome全体の復旧として報告しない。

## 検査と変更監査

副作用を事前確認し、engine検査はネットワークも保存も使わず、ADサーバー検査は一時フォルダだけ、更新復元検査は保存・通信のモックを使うことを確かめた。既存検査はengine70件、ADサーバー13件、更新設定5件、更新復元11件が成功した。ADサーバーは既存のNode24の型変換を利用し、他はNode26。Node26の型変換オプションと変換フックは非対応で失敗し、その試行もJSONに残した。依存パッケージは追加していない。

`npm run test:ad` のUI・sync部分はtsxとReact等が必要で、node_modulesがないため未実行。`npm run test:ad-server` と `npm run test:updates` のラッパーもtsxが必要なので、上記の同じ既存ファイルを直接実行した。全体のAD検査を通過したとは扱わない。

`CHANGELOG_BASE=29b78f5f6ca0c5e3302b6960ae2e3ffaf5cda88c` を子プロセスに指定して `npm run check:completion` を実行した。変更履歴検査は成功したが、その次の翻訳検査がtsx不足で失敗した。型検査とビルドも個別に実行し、tsc・vite不足で失敗した。これらは検査環境不足であり、完了検査が成功した状態ではない。最終的な差分・テスト結果・完了可否の確定はオーケストレータへ引き継ぐ。

報告検査は必須項目・型・非空値・検証状態と未検証理由・本文との対応・再現条件・実測結果を検査する。不正な報告6種類を拒否する自己検査も行う。開始時のGit状態表示とSHA-256の記録は保持する。既存のZIPは現在の状態表示にかかわらず開始時のSHA-256と照合し、LFSによる表示差を許容する。許可成果物4ファイルを除いたGitのindexも開始時のハッシュと照合する。対象ソースが指定コミットと一致すること、追加成果物が許可された4ファイルだけであることを確認する。開始時からのZIP差分を今回の変更として隠したり、取り消したりしない。

レビュー対応前は、この環境で `baseline status changed` により報告検査が失敗した。修正後の `node scripts/check-chrome-startup-freeze-investigation.mjs` は成功。仮説10件、実行記録52件、対象ソース42ファイル、不正な報告6種類の拒否、ZIP2本の内容保持、許可成果物4ファイルを確認した。変更監査の自己検査9条件では、状態表示の維持・消失・変化を許容し、状態表示が同じ場合と消えた場合の内容変更、開始時ファイルの欠落、許可外ファイルの変更・追加・削除を拒否した。許可成果物を除いたindexのハッシュは開始時記録と一致した。開始時の記録と既存の再現実測は更新していない。

レビュー対応後も `npm.cmd run check:completion` を上記の比較元で実行した。変更履歴検査は成功し、翻訳検査でtsxが見つからず停止した。完了検査は未通過のまま、オーケストレータへ引き継ぐ。調査スクリプトの再実行でJSONのrunを更新した場合は、本文の実行表と実測表もその記録へ合わせて更新してから検査する。検査は表のケース名だけでなく、時間・終了状態・初回同期などの値も照合する。

### 確認の記録

- 書き手・読み手・場面: 書き手: AIbon（指定）／読み手: 依頼者と後続の開発担当（推定）／場面: 調査結果と安全な対応案の報告（指定）
- 実行した検査: 資料とコード・実測結果の照合、報告JSONと本文の整合性、差分の監査。日本語は目視で読み返した。
- 実行しなかった検査: yomiyasuのlint・最終稿照合。python3、python、pyの順に試したが、いずれもこの環境では見つからなかった。
- yomiyasu-check: not_run reason=no_python

## 利用者環境での確認（後続担当向け・今回は未実施）

聞き取りで未回答の事項は既存の確認事項として残し、同じ質問をもう一度送ってはいない。次の調査は、すでに出ているエラーと停止箇所を優先する。実データの取得や変更は行わない。

1. 影響Chromeの画面をそのままにして、既存のConsoleエラーの種類・関数名とNetworkの `/auth/me`、`/ws`、`/healthz` の状態を本人が目視する。Cookie、認証ヘッダー、保存本文、会話内容は取得・送付しない。
2. 画面が動かずDevToolsの処理記録で長い同期処理が続く場合は、短いPerformance記録か一時停止時の関数名で計算・JSON処理・描画を分ける。処理位置を確認したら再開する。CPU記録にはURL等が含まれ得るので、無加工の記録を要求しない。
3. JavaScriptの処理が落ち着いているのにクリックが届かない場合は、Elementsの選択で対象位置を覆う要素と親の計算済みCSSを目視する。固定全面要素、opacity、pointer-events、disabledを区別し、DOMやスタイルを変更しない。
4. Applicationで稼働中SWのURL・版とキャッシュの存在だけを見る。サイトデータ削除、初期化、復旧記録整理、SW解除、拡張機能の設定変更は行わない。

修正後に同じChromeでセッション作成とメニュー操作が戻ることを確かめる工程は、原因の証拠と対応案の承認が揃った後の別工程とする。


## 仮説ごとの検証方法・結果・未検証理由

### H1 AD開始前半の同期例外で、参加済みの状態だけが残り接続が始まらない。

- 検証方法: 実物のenterとAD sliceを使い、プロフィール・選択・保留接続・旧セーブ・読取拒否・容量不足を一条件ずつ注入する。WebSocket生成だけをモックで数える。
- 結果: profiles-json/type、selection-json、pending-type、guest-json、quota-start、read-deniedでjoined=true、接続呼出0回。2回目のenterもjoinedのガードで戻った。通常条件は接続呼出1回。
- 根拠: client/src/auth.ts:enter / client/src/ad/slice.ts:adStart / runs:profiles-json,profiles-type,selection-json,pending-type,guest-json,quota-start,read-denied,normal
- 検証状態: partially-verified
- 未検証理由: 影響Chromeの保存状態・例外は不明。接続モック以降の画面操作は未検証。

### H2 1000チャンクの上限があっても、チャンク内の自動購入が長い同期処理になる。

- 検証方法: 同じ極端な進行値で自動購入の有無を比較し、tick・runAutobuyers・直列化比較も別プロセスで測る。
- 結果: huge-autoは初回同期で2500msを超え、親が終了した。huge-no-autoは戻った。engine-huge-autobuyは1回なら終了したがtick・比較より重い。無限停止とは判定しない。
- 根拠: client/src/ad/engine.mjs:offlineProgress,runAutobuyers,buyMaxDimension,buyMaxTickspeed / runs:huge-auto,huge-no-auto,engine-huge-tick,engine-huge-autobuy,engine-huge-serialize
- 検証状態: partially-verified
- 未検証理由: 指数10000000は合成境界値。影響環境の進行値・自動購入設定・CPU記録は未確認。

### H3 経過時間が長いことだけで起動が停止する。

- 検証方法: 通常の進行で8時間と365日を比較し、初回同期と定期処理を測る。
- 結果: elapsed-8h、elapsed-365dはいずれもsimulatedMs=28800000でreadyに到達。経過時間だけの条件では停止を再現しなかった。
- 根拠: client/src/ad/engine.mjs:OFFLINE_CAP_MS,offlineProgress / runs:elapsed-8h,elapsed-365d,auto-8h
- 検証状態: not-reproduced
- 未検証理由: 異なる進行値や端末性能まで原因から除外する結果ではない。

### H4 保存値の不正は失敗箇所によって影響範囲が違う。

- 検証方法: セーブ本体・比較基準・接続情報・復旧索引・復旧本文を個別に壊し、起動、初回同期、進捗一覧を観測する。
- 結果: save-json/nullとbaseline-jsonはloadProfileGameで捕捉され、ADはerrorでも接続は呼ばれた。connection-jsonも非同期側で捕捉。復旧索引の型違いはbackupでerror、復旧本文の不正JSONは一覧取得時に例外。次元・自動購入・時刻の型違いは各々正規化されready。
- 根拠: client/src/ad/slice.ts:loadProfileGame,resolveServer,adProgressSources / client/src/ad/user.mjs:listRecoveryRecords,listProgressSources / runs:save-json,save-null,baseline-json,connection-json,recovery-index-type,recovery-json,save-types,save-autobuyers-type,save-clock-type
- 検証状態: partially-verified
- 未検証理由: 一覧の例外がReactの画面へ及ぼす影響は未検証。全ての型の組合せを網羅していない。

### H5 safeStorageが取得後の全ての保存例外を防ぐ。

- 検証方法: 保存先の参照拒否、プローブ後の読取拒否、起動・採用・1秒保存の書込拒否を分ける。
- 結果: safe-probe-deniedはメモリ保存に切り替わりready。read-deniedとquota-startは同期例外が伝播。quota-adoptは同期error、quota-periodicは保存失敗を記録しreadyを維持した。この仮説は隔離条件内で否定された。
- 根拠: client/src/ad/storage.ts:safeStorage / client/src/ad/slice.ts:adStart,adopt,saveLocalNow / runs:safe-probe-denied,read-denied,quota-start,quota-adopt,quota-periodic
- 検証状態: verified-isolated
- 未検証理由: なし（隔離条件内の主張のみ。影響Chromeへの適用はH10参照）。

### H6 通信待ち・拒否・競合を、全体の入力停止と取り違えている可能性。

- 検証方法: 保存GETの保留、中断コールバック、401/403/409/429/500、保存POSTの409を別々に返す。
- 結果: 保留中はAD loadingだが接続呼出1回。中断後はerror、30秒で再接続。401/403とGETの409は再試行せず、429/500は再試行。POSTの409は再読込。choice中はAD進行を止め、選択後に再開した。
- 根拠: client/src/ad/api.ts:request / client/src/ad/slice.ts:retryable,resolveServer,saveServerNow,frozen / server/ad-store.ts:authorize,save / runs:network-stop,network-timeout,http-401,http-403,http-409,http-429,http-500,conflict-save,sync-choice
- 検証状態: partially-verified
- 未検証理由: 中断は手動発火で実時間5秒の通信検査ではない。実Chromeの入力は未検証。

### H7 保存量、復旧記録整理、100ms通知と描画購読が負荷を増やす。

- 検証方法: 1000プロフィール、2000復旧記録、2000000文字の保存値を別々に通常条件と比べ、定期処理と直列化比較を測る。
- 結果: 今回の件数では完了した。2百万文字では100ms処理100回、30秒同期、比較が通常より重かった。1000プロフィールと2000復旧記録では停止を再現しなかった。
- 根拠: client/src/ad/user.mjs:pruneAllRecoveryRecords,listProgressSources / client/src/ad/slice.ts:acknowledgeClock,storageFacts,timers / client/src/ad/sync.mjs:saveIdentity / runs:normal,profiles-1000,recovery-2000,save-2mb
- 検証状態: partially-verified
- 未検証理由: Map保存と通知の計測で、Chromeの保存待機・React描画・3D描画は未測定。

### H8 全面表示、無効なボタン、透明な要素や拡張機能が入力を妨げる。

- 検証方法: App共通表示、ServerNotices、復元表示、confirmAd、関連CSSと既存ADブラウザスクリプトを読む。
- 結果: maintenanceは固定全面・z-index120、AD確認は固定全面・z-index100、復元通知も全面モーダル。ADのloading/choiceはAD操作用の条件。現在の影響DOMは未確認。
- 根拠: client/src/App.tsx / client/src/world/ServerNotices.tsx / client/src/UpdateRecoveryNotice.tsx / client/src/world/antimatter/confirmAd.tsx / client/src/styles/responsive.css / client/src/styles/modal.css / client/src/world/antimatter/styles.ts / scripts/test-ad-browser.mjs
- 検証状態: code-only
- 未検証理由: 影響Chrome・拡張機能・DOM・計算済みCSSは未観測。AD専用ページの結果を全体起動の証拠には使わない。

### H9 翻訳初期化、更新復元、WebSocket、Service Workerも独立した候補。

- 検証方法: main、翻訳通知、resume/fetchAuth、WS、更新読取・復元、現在のsw.jsを読む。更新の既存単体検査を実行する。
- 結果: 翻訳取得は待たず描画するが巨大応答の解析・通知は同期負荷になり得る。fetchAuthに独自期限はない。復元読取失敗は通知側で捕捉。WSは初回呼出後のcloseで再接続。現在のSWは通常資産をキャッシュしない。更新検査5件と11件は成功。
- 根拠: client/src/main.tsx / client/src/content-translations.ts / client/src/net/ws.ts / client/src/updateRecovery.ts / client/src/updateFlow.ts / client/public/sw.js / runs:test:update-flow-native,test:update-recovery-native
- 検証状態: code-only
- 未検証理由: 実環境の翻訳応答、auth/me、WS、稼働中SW、既存キャッシュ、復元値は未確認。

### H10 今回の隔離検査で影響Chromeの全体操作不能まで再現できた。

- 検証方法: 隔離単体検査とブラウザ全体起動の証拠を区別する。
- 結果: ブラウザ全体起動は未実施。接続中断の構造と合成条件の長時間処理を確認した段階で、利用者の原因は特定していない。
- 根拠: runs:normal,huge-auto / scripts/investigate-chrome-startup-freeze.mjs
- 検証状態: unverified
- 未検証理由: 端末・OS・Chrome版・保存状態・既存エラー・添付内容が未確認で、実データにもアクセスしていない。

## 否定できた原因（条件を限定したもの）

- 研究所画面を開かなければADは起動しない、という説明。
  範囲: 対象コミットの通常ログイン済み起動。ストア作成と認証後の開始を区別する。
  根拠: auth.ts、store.ts、slice.tsとnormalの実測。

- safeStorageが後続の保存操作も全て捕捉する、という説明。
  範囲: 保護は参照とプローブの読取のみ。後続の解析・読取・書込は呼出側次第。
  根拠: H5の合成拒否ケース。

- ADのloading/choiceだけで全体の入力が止まる、という説明。
  範囲: sliceが止めるADの処理。別の描画や拡張機能までは除外しない。
  根拠: network-stop、sync-choiceでも接続呼出1回。App分岐はAD状態を使わない。

- 経過日数だけに比例して計算回数が無制限に増える、という説明。
  範囲: 通常値の8時間・365日。購入処理の負荷は別に残る。
  根拠: H3、8時間・1000チャンク上限。

- 現在のsw.jsが通常の資産キャッシュを作る、という説明。
  範囲: 対象コミットのSW本文のみ。旧版SWとHTTPキャッシュは未確認。
  根拠: client/public/sw.jsのnavigateハンドラ。

## 残る候補と安全な切り分け

### 保存情報の例外によるAD開始中断と未接続状態。

必要な最小限の証拠: 最初の例外の種類・ファイルと関数、/wsが開始したか。保存本文は不要。

安全な確認手順: データを消さず既存ConsoleエラーとNetworkのWSの有無を目視する。必要なら例外停止で現在の処理位置だけ確認する。

### オフライン自動購入、定期処理、保存比較による長時間占有。

必要な最小限の証拠: 短いPerformance記録または停止時の関数名。自動購入設定は本人が確認できる範囲だけ。

安全な確認手順: 初期化せず、数秒の処理記録か一時停止時の関数を確認する。送付時はURLや個人情報を伏せる。

### 全面要素、無効状態、拡張機能による入力の遮断。

必要な最小限の証拠: 操作位置の最前面要素とdisabled、pointer-events、opacity、position、z-index。

安全な確認手順: Elementsと親の計算済みCSSを目視する。値を書き換えず要素も削除しない。影響プロファイルの拡張機能設定は変更しない。

### 認証待ち、WS失敗、更新復元、旧SW・キャッシュ。

必要な最小限の証拠: /auth/me、/ws、/healthzの状態、SWのURL・版、更新通知の有無。

安全な確認手順: NetworkとApplicationの閲覧だけ。Cookieや認証ヘッダーを取得せず、SW解除・キャッシュ削除・再インストールは実行しない。

## 次に必要な証拠

- 端末・OS・Chromeの版。
  目的: 実行環境と性能条件を絞る。
  手順: 本人がChromeの版情報を確認する。設定や保存データは変えない。

- 直前の操作、最初のエラー、停止箇所。
  目的: 例外・長時間処理・入力遮断を分ける。
  手順: 既存の記録を優先し、実データを取得せず関数名と状態だけ確認する。

- 正常な別ブラウザも同じMisskeyアカウントか。
  目的: アカウント差とブラウザ内保存差を混同しない。
  手順: 既存の聞き取り結果を待つ。切替やログアウトは実行しない。

- 未確認の添付内容。
  目的: 既存の証拠を取りこぼさず、同じ質問を繰り返さない。
  手順: 今回アクセスできないと記録し、内容を推測せず後続担当が元の依頼で確認する。

## 対応案（今回の実装なし）

### ADの保存失敗を通常の入室接続から切り離す（推奨）。

接続まで中断する経路を合成データで確認した。実環境の例外とWSの証拠が一致した場合の第一候補。

- 改善する場所: auth.tsのenter、slice.tsのadStartと進捗選択準備。
- 影響範囲: 初期化の例外処理と開始済み状態の確定順。認証・権限と保存値を保つ。
- 回帰確認: 壊れたプロフィール・選択・保留接続、読取拒否・容量不足でも通常接続が始まること。AD失敗表示、再実行、二重接続、更新復元との競合を確認する。

### オフライン計算と自動購入に実行時間の予算を設ける。

極端な合成値で累積負荷を再現した。実環境のスタックが購入処理を示す場合に進める。

- 改善する場所: engine.mjsの購入ループとofflineProgress、slice.tsのadopt・100ms処理。
- 影響範囲: 計算・比較・通知の分割、または一括購入計算。既存の購入順・リセット・同期の意味を保つ。
- 回帰確認: 現行境界検査と、分割前後の購入・Boost・Galaxy・Infinity結果、8時間上限、途中失敗、同期選択、低性能環境での応答を比較する。

### 保存・同期・共通表示の失敗箇所を診断表示で区別する。

AD停止と通常接続停止と全面表示を区別する証拠が不足している。DOMや拡張機能への対応は証拠を見て決める。

- 改善する場所: 既存のAD保存失敗記録、App起動、ServerNoticesと更新復元表示。
- 影響範囲: 件数・所要時間・失敗段階だけを既存記録へ足す。本文・認証情報・他人の情報は記録しない。
- 回帰確認: 例外・拒否・競合・入力遮断を誤表示しないこと。記録失敗で接続・保存を妨げないこと、三言語表示、画面を閉じる操作を確認する。

## 実行記録一覧

時間は親が測ったプロセス全体の時間。終了0は観測完了を表し、注入した例外が起きなかった意味ではない。watchdog-spinは監視の自己検査で、製品の失敗ではない。完全なコマンド、環境版、再実行条件、結果はJSONの各runにある。

| ケース | 制限ms | 終了 | 実測ms | 最終段階・観測 |
|---|---:|---|---:|---|
| test:ad-server-native | 30000 | 9 | 35.733 | spawn |
| normal | 10000 | 0 | 153.713 | AD=ready; WS=1 |
| profiles-json | 10000 | 0 | 100.002 | Error; joined=true; WS=0 |
| profiles-type | 10000 | 0 | 100.089 | Error; joined=true; WS=0 |
| selection-json | 10000 | 0 | 97.989 | SyntaxError; joined=true; WS=0 |
| pending-type | 10000 | 0 | 99.112 | TypeError; joined=true; WS=0 |
| guest-json | 10000 | 0 | 115.744 | SyntaxError; joined=true; WS=0 |
| save-json | 10000 | 0 | 121.065 | AD=error; WS=1 |
| save-null | 10000 | 0 | 118.318 | AD=error; WS=1 |
| baseline-json | 10000 | 0 | 116.177 | AD=error; WS=1 |
| connection-json | 10000 | 0 | 113.512 | AD=error; WS=1 |
| recovery-index-type | 10000 | 0 | 118.164 | AD=error; WS=1 |
| recovery-json | 10000 | 0 | 127.593 | AD=ready; WS=1 |
| quota-start | 10000 | 0 | 98.337 | QuotaExceededError; joined=true; WS=0 |
| quota-adopt | 10000 | 0 | 113.649 | AD=error; WS=1 |
| quota-periodic | 10000 | 0 | 124.559 | AD=ready; WS=1 |
| read-denied | 10000 | 0 | 98.762 | SecurityError; joined=true; WS=0 |
| safe-probe-denied | 10000 | 0 | 135.807 | AD=ready; WS=1 |
| profiles-1000 | 10000 | 0 | 142.021 | AD=ready; WS=1 |
| recovery-2000 | 10000 | 0 | 167.223 | AD=ready; WS=1 |
| save-2mb | 10000 | 0 | 383.22 | AD=ready; WS=1 |
| elapsed-8h | 10000 | 0 | 128.711 | AD=ready; WS=1 |
| elapsed-365d | 10000 | 0 | 150.784 | AD=ready; WS=1 |
| huge-no-auto | 10000 | 0 | 148.999 | AD=ready; WS=1 |
| network-stop | 10000 | 0 | 139.226 | AD=loading; WS=1 |
| network-timeout | 10000 | 0 | 113.727 | AD=loading; WS=1 |
| watchdog-spin | 750 | timeout / SIGKILL | 762.385 | intentional-watchdog-self-check |
| http-401 | 10000 | 0 | 114.867 | AD=error; WS=1 |
| http-403 | 10000 | 0 | 115.288 | AD=error; WS=1 |
| http-409 | 10000 | 0 | 115.879 | AD=error; WS=1 |
| http-429 | 10000 | 0 | 120.131 | AD=error; WS=1 |
| http-500 | 10000 | 0 | 126.597 | AD=error; WS=1 |
| conflict-save | 10000 | 0 | 129.779 | AD=ready; WS=1 |
| sync-choice | 10000 | 0 | 130.048 | AD=choice; WS=1 |
| test:engine | 30000 | 0 | 2343.969 | spawn |
| test:ad-server-transform-hook | 30000 | 1 | 90.504 | spawn |
| test:update-flow-native | 30000 | 0 | 146.934 | spawn |
| test:update-recovery-native | 30000 | 0 | 852.409 | spawn |
| test:ad-server-node24 | 30000 | 0 | 1396.379 | spawn |
| test:npm-check:completion | 30000 | 1 | 9506.904 | spawn |
| test:npm-typecheck | 30000 | 1 | 183.977 | spawn |
| test:npm-build | 30000 | 1 | 208.277 | spawn |
| engine-huge-tick | 10000 | 0 | 63.954 | complete |
| engine-huge-autobuy | 2500 | 0 | 195.548 | complete |
| engine-huge-serialize | 10000 | 0 | 57.802 | complete |
| auto-8h | 10000 | 0 | 149.64 | AD=ready; WS=1 |
| huge-auto | 2500 | timeout / SIGKILL | 2515.224 | first-sync |
| save-types | 10000 | 0 | 147.923 | AD=ready; WS=1 |
| save-autobuyers-type | 10000 | 0 | 131.566 | AD=ready; WS=1 |
| save-clock-type | 10000 | 0 | 126.2 | AD=ready; WS=1 |
| number-boundary | 10000 | 0 | 130.266 | AD=ready; WS=1 |
| number-subnormal | 10000 | 0 | 133.199 | AD=ready; WS=1 |

## 処理別の実測

単位ms。初回同期はモック応答からイベント処理が落ち着くまで。100回は描画なしの通知を含む100ms処理100回の合計。各1回の計測で、統計や実端末の速度保証ではない。

| 条件 | 初回同期 | 100ms処理1回 | 1秒処理1回 | 30秒処理1回 | 100回 | 直列化と比較 |
|---|---:|---:|---:|---:|---:|---:|
| normal | 2.015 | 0.457 | 0.068 | 0.641 | 5.555 | 0.037 |
| elapsed-8h | 9.295 | 0.549 | 0.464 | 1.494 | 3.679 | 0.039 |
| elapsed-365d | 9.205 | 0.555 | 0.383 | 1.463 | 3.419 | 0.035 |
| auto-8h | 18.359 | 0.62 | 0.321 | 1.597 | 4.113 | 0.045 |
| huge-no-auto | 10.558 | 0.669 | 0.349 | 1.605 | 4.695 | 0.045 |
| profiles-1000 | 2.754 | 0.894 | 0.401 | 2.1 | 5.857 | 0.041 |
| recovery-2000 | 2.203 | 1.356 | 0.098 | 0.716 | 4.445 | 0.04 |
| save-2mb | 7.632 | 1.773 | 0.672 | 12.294 | 221.533 | 2.803 |

| エンジン単体（極端値・同じ自動購入設定） | 処理ms | 結果 |
|---|---:|---|
| engine-huge-tick | 0.416 | 入力検証を通過し終了 |
| engine-huge-autobuy | 133.346 | 入力検証を通過し終了 |
| engine-huge-serialize | 0.176 | 入力検証を通過し終了 |

## 確認したファイル

記録開始: 2026-11-21T23:37:22.451Z。指定コミットと改行を正規化したハッシュで照合する。ファイルの存在だけで確認済みにはしない。具体的な経路・関数は本文と各仮説の根拠に記載した。

| パス | 確認範囲 |
|---|---|
| CLAUDE.md | Referenced startup path, tests or display behavior described in Markdown |
| docs/direction.md | Referenced startup path, tests or display behavior described in Markdown |
| package.json | Referenced startup path, tests or display behavior described in Markdown |
| client/src/main.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/App.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/auth.ts | resume, fetchAuth, enter exception propagation |
| client/src/store.ts | common store initialization and guarded persistence |
| client/src/ad/slice.ts | AD startup, sync, selection/restore and 100/1000/30000ms callbacks |
| client/src/ad/user.mjs | selection, profiles, recovery enumeration/pruning, connection reads |
| client/src/ad/storage.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/ad/link.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/ad/api.ts | abort, response parsing and HTTP errors |
| client/src/ad/sync.mjs | Referenced startup path, tests or display behavior described in Markdown |
| client/src/ad/engine.mjs | deserialization, offline simulation, tick, autobuy, purchases, resets, numbers |
| client/src/ad/sync.test.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/ad/engine-boundaries.test.mjs | Referenced startup path, tests or display behavior described in Markdown |
| server/ad-store.ts | authorization, revision conflict, persistence |
| server/ad-store.test.ts | Referenced startup path, tests or display behavior described in Markdown |
| server/index.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/net/ws.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/updateRecovery.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/updateFlow.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/UpdateRecoveryNotice.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/world/ServerNotices.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/world/antimatter/confirmAd.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/world/antimatter/styles.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/world/antimatter/antimatter-panel.css | Referenced startup path, tests or display behavior described in Markdown |
| client/src/styles/responsive.css | Referenced startup path, tests or display behavior described in Markdown |
| client/src/styles/modal.css | Referenced startup path, tests or display behavior described in Markdown |
| client/src/style.css | Referenced startup path, tests or display behavior described in Markdown |
| client/src/content-translations.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/i18n/index.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/i18n/core.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/home/Home.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/world/antimatter/adapter.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/src/view3d/AntimatterReadout.tsx | Referenced startup path, tests or display behavior described in Markdown |
| client/public/sw.js | Referenced startup path, tests or display behavior described in Markdown |
| scripts/test-ad-browser.mjs | Referenced startup path, tests or display behavior described in Markdown |
| client/src/updateFlow.test.ts | Referenced startup path, tests or display behavior described in Markdown |
| client/src/updateRecovery.test.mjs | Referenced startup path, tests or display behavior described in Markdown |
| scripts/check-changelog.mjs | Referenced startup path, tests or display behavior described in Markdown |
| scripts/register-test-css.mjs | Referenced startup path, tests or display behavior described in Markdown |
