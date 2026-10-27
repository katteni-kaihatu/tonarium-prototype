# RPG 플레이·대화 기록 조회

운영자는 저장된 GM·NPC 대화를 다시 읽을 수 있다. 저장 위치는 서버의 `DATA_DIR/fantasy-diagnostics/`이며, 게임 안의 공개 메뉴 대신 운영 명령으로 조회한다. 배포 후에는 배포 서버에서 명령을 실행하고, 내보낸 HTML 파일을 자신의 컴퓨터로 가져와 열면 된다.

한국어 대화 중 린과 나눈 최근 대화를 조회하려면 프로젝트 폴더에서 다음 명령을 실행한다. 실제 운영 서버에서는 `--data-dir`을 그 서버의 저장 경로로 바꾼다.

```powershell
npm run fantasy:diagnostics -- conversations --data-dir E:\tonarium2\data --npc rin --locale ko --limit 100
```

브라우저에서 읽을 HTML로 저장할 수도 있다. 출력 파일은 새 이름을 지정해야 한다.

```powershell
npm run fantasy:diagnostics -- conversations --data-dir E:\tonarium2\data --format html --output E:\tonarium2\work\qa\conversations.html
```

`--npc gm`으로 GM만, `--from`·`--to`로 기간을 고를 수 있다. 날짜만 쓰면 UTC 기준이므로 한국 시간으로 정확히 고르려면 `2026-10-27T00:00:00+09:00` 같은 시각을 쓴다. 기록에는 질문·답변·NPC·언어·시각·응답 경로·응답 시간·오류가 들어가며, 답이 오기 전 끊긴 대화도 표시한다. 기본 보관 한도는 최대14일·총64MiB다. 한도에 도달하면 오래된 기록부터 지운다.

모든 월드 GM·NPC 대화를 기록하도록 설정했지만, 알아볼 수 있는 인증정보는 가린다. 자유 발화의 모든 개인정보를 자동으로 찾는 것은 아니다. 내보낸 파일도 운영자만 접근할 곳에 보관하고 `client/public`·`client/dist`나 공개 저장소에 넣지 않는다. 개발 서버는 데이터·로그·키와 `work/` 경로를 차단한다. 게임 저장과 별도이며, 기록 도중 디스크 문제나 과부하가 생기면 플레이를 유지하는 대신 일부 기록이 빠질 수 있다.

## 기술·운영 상세

実プレイで起きた操作、成長・資源の増減、判定、活動、寿命・世代、接続、パーティー、戦闘、AI 応答の経路・所要時間・品質を、後から調べるためのサーバー側 JSONL ログ。保存先は `DATA_DIR/fantasy-diagnostics/`。ゲームのセーブデータとは別に保存する。

ログは調査の補助情報であり、セーブデータの復元には使わない。キュー超過やディスク障害時には欠落することがある。

## 保存範囲と匿名化

イベントは許可した種別、時刻、操作コード、結果コード、数値だけを保存する。今回の運用設定では、管理者が後から読み返せるように GM・NPC の問い合わせと応答も `all` で保存する。アカウント管理ペイロード、パスワード、Cookie、認証トークン、復旧コード、参加チケット、人物プロフィール、システムプロンプト、ゲーム全体の状態はログへ渡さない。

`actorId`、`sessionId`、`requestId`、`combatId`、`activityId`、`encounterId` は保存前に HMAC-SHA256 の先頭 24 桁へ置き換える。元の識別子はログに書かない。識別子の種類ごとにハッシュを分離する。同じ保存先では再起動後も同じ匿名 ID になる。別の保存先では異なる ID になる。

秘密鍵はログディレクトリ内の `.actor-key` に保存する。共有用ログへ含めない。鍵をなくすと、それ以降の匿名 ID と過去の匿名 ID を対応付けられなくなる。POSIX ではディレクトリを `0700`、ファイルを `0600` で作成する。Windows のアクセス制御は保存先の ACL で管理する。鍵が不正、読取不能、リンクの場合は診断を停止し、元 ID を代わりに保存することはない。

許可したフィールド以外は捨てる。入れ子オブジェクトや任意のエラー本文も捨てる。操作・理由・品質などの文字列は、96 文字以内の英数字と `_.:/,+-` からなるコードのみ受け付ける。日本語の物語本文や例外メッセージをこれらのフィールドへ渡さない。

## 会話本文

サーバーの本文設定は `FANTASY_DIAGNOSTICS_DIALOGUE_MODE` で変更できる。今回の運用では `all` が標準。再利用用 `FantasyDiagnostics` クラス単体の標準値は `off`。

| captureMode | 保存する本文 |
| --- | --- |
| `off` | なし。文字数と応答メタデータのみ |
| `issues` | エラー、失敗・拒否・キャンセル・タイムアウト、フォールバック、低品質などと判定された応答 |
| `all` | `recordDialogue` に渡した問い合わせ・応答 |

サーバーの本文は問い合わせ・応答それぞれ 4,000 文字まで。上限を超えた場合は `queryTruncated` / `replyTruncated` を付け、会話閲覧にも省略を表示する。パスワード・トークンなどのラベル付き値、Cookie・認証ヘッダー、一般的な API キー形式、メールアドレス、国番号付き電話番号を伏せる。日本語・韓国語の主要な認証語も対象とする。ただし個人名や自由文中の個人情報をすべて検出できるわけではない。本文を含むログと閲覧用書き出しファイルは、アクセスを制限した保存先で管理する。

ファイル上限より大きいイベントは、まず本文を除去して `dialogueOmitted: true` を付ける。それでも収まらないイベントは捨てる。集計 CLI は本文を表示しない。

## 上限と障害時の動作

| 設定 | 標準値 |
| --- | --- |
| `retentionDays` | 14 日 |
| `maxFileBytes` | 4 MiB |
| `maxTotalBytes` | 64 MiB |
| `maxFiles` | 64 ファイル |
| `maxQueueSize` | 1,024 イベント |
| `maxTextChars` | サーバーではそれぞれ 4,000 文字。クラス単体では 1,200 文字 |

環境変数は `FANTASY_DIAGNOSTICS_DIALOGUE_MODE=all|issues|off`、`FANTASY_DIAGNOSTICS_RETENTION_DAYS`、`FANTASY_DIAGNOSTICS_MAX_TOTAL_BYTES`、`FANTASY_DIAGNOSTICS_MAX_FILE_BYTES`、`FANTASY_DIAGNOSTICS_MAX_QUEUE`。容量はバイト数で指定する。保存先は `DATA_DIR/fantasy-diagnostics` 固定で、Web クライアントから指定できない。

UTC の日付が変わったとき、またはファイル上限に達する前に新しいファイルへ切り替える。起動時と切替時に期限・合計容量・ファイル数を確認し、古いログから削除する。容量上限は次のファイル分を確保して維持する。削除対象は `play-YYYYMMDDTHHMMSSmmmZ-xxxxxxxx.jsonl` に一致する通常ファイルだけ。知らないファイル、リンク、秘密鍵は自動削除しない。停止中やイベントが発生しない間は削除処理を実行しない。

`record` と `recordDialogue` はディスク処理を待たず、例外を呼出元へ投げない。メモリキューが満杯なら新しいイベントを捨て、次の書込みで `diagnostics.drop` に件数を記録する。ディスクや鍵に障害が発生した場合はそのインスタンスの診断を停止し、プレイを継続する。`stats` で `written`、`dropped`、`failures`、`queued`、`disabled` を確認できる。

終了時は `close()`、途中で書込み完了を待つ必要がある管理処理では `flush()` を使う。プレイ操作の途中で待たない。強制終了時は最後のイベントが失われたり、最終行が途中までになったりすることがある。集計は途中の最終行を読み飛ばす。

## 読取り専用の集計

保存先を絶対パスで指定する。以下はログを読み取るだけで、鍵・ログ・セーブデータを作成・変更しない。

```powershell
npx tsx scripts/fantasy-diagnostics.ts report --data-dir E:\tonarium2\data
```

診断ディレクトリを直接指定することもできる。

```powershell
npx tsx scripts/fantasy-diagnostics.ts --directory E:\tonarium2\data\fantasy-diagnostics
```

出力は JSON。イベント種別、状態、エラーコード、AI 経路・品質、問題件数、匿名プレイヤー数、資源差分合計、所要時間の最小・最大・平均・中央値・95 パーセンタイル、会話本文を含むイベントの件数、欠落件数を集計する。会話本文、匿名 ID 一覧、秘密鍵は出力しない。

標準で最新 256 ファイル、合計 64 MiB、1 行 32 KiB まで処理する。上限に達した場合は `limited: true`。JSON 不正行・大きすぎる行は `ignoredLines`、不完全な最終行は `ignoredPartialLines`、読取り失敗は `unreadableFiles` で確認する。認識しないファイル名やリンクは集計しない。ディレクトリ自体がリンクなら拒否する。

集計の資源差分は記録されたイベントの合計であり、現在の所持品やセーブ残高ではない。所要時間は `durationMs` を持つイベントだけが対象で、プレイヤーの待機時間やネットワーク往復をすべて含むとは限らない。

## 管理者が会話を読み返す

会話本文は明示的に `conversations` を指定した場合にだけ表示する。サーバーへの公開管理 HTTP ページは作らない。

```powershell
npx tsx scripts/fantasy-diagnostics.ts conversations --data-dir E:\tonarium2\data --from 2026-10-27 --to 2026-10-27 --locale ko --limit 100
```

`--from` / `--to` は ISO タイムスタンプまたは `YYYY-MM-DD`。日付だけなら UTC の一日全体を対象にする。`--npc rin`（リン）や `--npc gm`、`--locale ko|en|ja`、`--actor 匿名ID` で絞り込める。日時の新しいものから標準で 100 件、最大 1,000 件を選び、表示時は時刻順に並べる。対象件数と表示件数が異なるときは `limited` を表示する。

完了した会話は問い合わせ・応答を一つのターンとして表示する。匿名プレイヤー・要求 ID・接続・NPC・言語と保存済み問い合わせが一致する開始・完了イベントを一対一で対応付け、別プレイヤーが同じ要求 ID を使った場合や、同じプレイヤーが要求 ID を再利用した場合も別ターンとして扱う。識別子や本文が揃わず対応を確認できない記録は、個別の記録として残す。

返答のない問い合わせは `pending`、中断された返答は `cancelled` と表示する。強制終了前の問い合わせや切断理由を調べるため、これらを完了済み会話の陰に隠さない。見出しには状態、理由・エラーコード、所要時間も表示する。日付フィルターは、完了したターンでは返答時刻、未完了では問い合わせ時刻が対象。対応した問い合わせの時刻は `startedAt` で確認できる。

会話の対応付けでは最大 65,536 件の短いメタデータだけを保持し、選んだターンの本文をもう一度読み取る。再読量は `rereadBytes`。各読取りは集計と同じファイル数・容量・行長の上限を守り、本文全体をメモリへ読み込まない。対応付け上限、読取り上限、表示上限、再読前のログ削除などで結果が制限された場合は `limited: true`。上限内で見つかった記録の件数・表示件数として扱う。

形式は `--format text`（標準）、`json`、`html`。`--output` で絶対パスの新しいファイルへ書き出せる。既存ファイルは上書きしない。`--output` を指定しなければ標準出力へ表示する。

```powershell
npx tsx scripts/fantasy-diagnostics.ts conversations --data-dir E:\tonarium2\data --npc gm --format html --output E:\tonarium2\work\qa\gm-conversations.html
```

HTML はローカルで開く読み物。本文を HTML エスケープし、外部通信・スクリプト・フォームを CSP で無効にする。書き出しには本文、時刻、NPC、言語、匿名プレイヤー ID を含む。秘密鍵やアカウント情報は含めない。保持日数・総容量・ファイル数のいずれかに達すると元ログは削除されるため、すべての会話を無期限・無制限に保存する機能ではない。

## サーバーでの利用

```ts
const diagnostics = new FantasyDiagnostics({
  directory: path.join(DATA_DIR, 'fantasy-diagnostics'),
  captureMode: 'off',
});
diagnostics.record({
  type: 'action', actorId: principal, action: 'gather', status: 'ok',
  moneyDelta: 4, generation: 2,
});
diagnostics.recordDialogue({
  type: 'ai.reply', actorId: principal, requestId, npcId: 'rin',
  route: 'local', status: 'ok', durationMs: 125,
}, { query, reply });
```

`FantasyDiagnosticEvent` が保存可能なスカラーを定義する。`summarizeDiagnostics` は CLI と同じ集計を返し、`maxFiles`、`maxBytes`、`maxLineBytes` を指定できる。書込み・集計のどちらにも追加ライブラリは不要。

## 실제 서버에서 남기는 진단

- `game.action`·`game.command`: 행동 종류·처리 결과·오류 코드·저장 버전·처리 시간. 같은 행동의 명령 처리와 행동 적용은 별도 사건이므로 두 건을 플레이 횟수로 합산하지 않는다.
- `profile.delta`·`roll.result`: HP·MP·금화·경험치·허기·피로의 변화와 새 판정의 합계·목표·성공 여부. 전체 소지품이나 기록 본문을 복사하지 않는다.
- `activity.*`·`lifecycle.*`·`combat.*`: 작업 시작·중간 진행·완료·취소, 사망·새 삶, 전투 상태와 새 판정. 중복 화면 전송을 중복 실적으로 기록하지 않는다.
- `ai.request`·`ai.reply`: 요청 시작과 실제 전달 답변. 조회 화면은 한 번의 대화로 묶고, 연결 중단·계정 변경·요청 교체를 구분한다. 내부 호출별 표식을 확인하므로 같은 요청 번호를 재사용해도 이전 답이 새 대화에 붙지 않는다.
- `ai.quality`: 나이·날씨 충돌, 문장 수와 GM 말투 같은 좁은 이상 징후. 의미의 정확성·자연스러움에 대한 합격 판정은 아니며, 별도 모델 호출이나 자동 재생성을 추가하지 않는다.

집계의 전체 시간 통계는 서로 다른 사건 종류를 함께 포함한다. AI 응답 시간은 개별 `ai.reply`의 `durationMs`로 확인한다. 품질 징후 사건에는 응답 시간을 중복 기입하지 않는다. 정상 종료 때 최대2초 동안 기록 쓰기를 기다리지만 강제 종료·디스크 장애에서 완전 저장을 보장하지 않는다.
