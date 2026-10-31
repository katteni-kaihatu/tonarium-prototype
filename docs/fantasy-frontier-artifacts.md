# 未踏大陸の装備アーティファクト

未踏大陸で発見した新しい遺跡を初めて制覇したとき、30%の確率でこのカタログから1個を発見する。各人物・各遺跡につき最初の制覇だけが対象で、外れた結果も保存される。部屋の再訪・再制覇では再抽選しない。パーティーでは各人物の初回制覇と抽選を個別に記録する。

28種類すべてに韓国語・英語・日本語の名前と説明がある。一般の探索ドロップ、商店、制作レシピには追加しない。既存の鑑定・売却用の遺物とは別の、装備して使う品物。

## 装備と上限

専用の `artifact` 部位は1枠。所有している品物を実際に装備したときだけ効果が出る。所持するだけ、別の部位に保存する、同じ品物を複数持つ、といった状態では効果は増えない。付け替えると元の効果が消える。装備個体の指定があれば、その個体の所有と品物も検証する。

能力値・判定・被害軽減は通常の装備集計を使う。下記は品物そのものの値で、能力値から派生する最大HP・MPの計算は既存の規則に従う。追加の探索機能は以下の上限を持つ。

- 寒さ・暑さ・雨は各1段階軽減。暗さの不利は1軽減しても最低1が残る。暗さを軽減する品物は灯りや暗視能力にはならない。
- 野営の回復は最大HP/MPの各5%分、基本疲労回復は5まで追加。野営の襲撃確率は最大8%軽減する。安全の保証や街の宿サービスは提供しない。
- 成功した資源採集の収穫は最大1個追加。採集失敗や狩り、宝箱に追加報酬を与えない。
- 食料の劣化は最大25%遅くなる。効果が有効な経過時間だけ `preservedHours` に保存し、付け替えで過去の鮮度を戻さない。既に傷んだ食品には効かず、保存処理の再実行でも時間を二重計上しない。
- 保冷魔法鞄の対象は従来どおり10%の速度で劣化する。鞄とアーティファクトを掛け合わせず、強い方だけを使う。鞄に入りきらない食料にはアーティファクトが効く。

## カタログ

IDはすべて `frontier-` で始まる。

| ID末尾 | 한국어 / English / 日本語 | 装備中の効果 |
| --- | --- | --- |
| ember-acorn | 겨울잠 불씨 도토리 / Hibernating Ember Acorn / 冬眠する熾火のどんぐり | 寒さ−1 |
| pocket-refrigerator | 주머니 냉장고 / Pocket Refrigerator / ポケット冷蔵庫 | 食品の劣化25%減速 |
| weather-remote | 날씨 리모컨: 건전지 없음 / Weather Remote: Batteries Missing / 天気リモコン・電池なし | 雨−1 |
| sunshade-satellite | 양산 위성 / Sunshade Satellite / 日傘衛星 | 暑さ−1 |
| night-shift-badge | 야근 면제 배지 / Night Shift Exemption Badge / 夜勤免除バッジ | 暗さ−1、最低1 |
| dream-pillow | 왕실 낮잠 베개 / Royal Nap Pillow / 王室の昼寝枕 | 野営HP回復+5%分 |
| coffee-pot | 영원히 미지근한 커피포트 / Eternally Lukewarm Coffee Pot / 永遠にぬるいコーヒーポット | 野営MP回復+5%分 |
| do-not-disturb | 방해 금지 문패 / Do Not Disturb Plaque / 起こさないで札 | 野営襲撃確率8%減 |
| helpful-trowel | 퇴근을 원하는 모종삽 / Clocking-Off Trowel / 定時で帰りたい移植ごて | 成功した資源採集の収穫+1 |
| grandma-star | 할머니가 뜬 별 / Grandma-Knitted Star / おばあちゃんが編んだ星 | 寒さ−1、野営HP回復+2.5%分 |
| cloud-dehumidifier | 구름 제습기 / Cloud Dehumidifier / 雲の除湿機 | 雨−1、野営MP回復+2.5%分 |
| moon-projector | 가정용 달 영사기 / Domestic Moon Projector / 家庭用の月映写機 | 暗さ−1、野営襲撃確率4%減 |
| lunch-bell | 점심시간 종 / Lunch Break Bell / お昼休みの鐘 | 食品劣化20%減速、野営HP回復+2.5%分 |
| solar-thermos | 태양 냉차 보온병 / Solar Iced-Tea Flask / 太陽の冷茶ボトル | 暑さ−1、野営MP回復+2.5%分 |
| room-service-button | 황야 룸서비스 버튼 / Wilderness Room Service Button / 荒野のルームサービスボタン | 野営疲労回復+3、HP回復+2.5%分 |
| hiking-snail | 접이식 등산 달팽이 / Folding Hiking Snail / 折りたたみ登山かたつむり | 野営基本疲労回復+5 |
| whisper-antenna | 수다쟁이 속삭임 안테나 / Chatty Whisper Antenna / おしゃべり囁きアンテナ | 一般行動の判定+1、暗さ−1 |
| bureaucratic-paperweight | 거인의 결재 문진 / Giant Bureaucratic Paperweight / 巨人の決裁文鎮 | 力+2 |
| rubber-duck | 무패의 목욕 오리 / Undefeated Bath Duck / 無敗の風呂あひる | 体力+1、戦闘被害軽減+2 |
| calculating-skull | 암산하는 해골 / Mental-Arithmetic Skull / 暗算するどくろ | 知力+2 |
| rehearsal-stopwatch | 리허설 초시계 / Rehearsal Stopwatch / 予行演習ストップウォッチ | 敏捷+2、手先+1 |
| emergency-exit-sign | 휴대용 비상구 표지 / Portable Emergency Exit Sign / 携帯非常口標識 | 敏捷+1、一般行動の判定+1 |
| invoice-charm | 반려되지 않는 영수증 / Never-Rejected Receipt / 差し戻されない領収書 | カリスマ+2、運+1 |
| paper-dragon | 보험 든 종이 용 / Insured Paper Dragon / 保険付きの紙竜 | 最大HP+12、戦闘被害軽減+1 |
| mana-usb | 방향이 세 개인 마나 USB / Three-Way Mana USB / 三回裏返す魔力USB | 最大MP+15 |
| lucky-dice | 은퇴한 사기 주사위 / Retired Loaded Dice / 引退したいかさま賽 | 運+2 |
| mechanical-pen | 고대의 자동 필기구 / Ancient Mechanical Pencil / 古代のシャープペン | 手先+2、一般行動の判定+1 |
| honest-vending-machine | 거스름돈 지키는 자판기 / Honest Change Vending Machine / お釣りを守る自販機 | 体力+2、最大HP+8 |

## 実装の接続

`shared/fantasy-frontier-artifacts.ts` の `FANTASY_FRONTIER_ARTIFACTS` が登録用の品物一覧。`fantasyEquippedArtifact` は所有と装備個体を検証した1個だけを返す。`fantasyArtifactEffects` はその1個から次の数値を返し、未装備時はすべて0になる。

`coldRelief`、`heatRelief`、`rainRelief`、`darknessRelief` は環境の負担へ接続する。`campHpBonus`、`campMpBonus` は最大値に対する割合、`campFatigueBonus` は基本疲労回復への加算、`campRiskReduction` は襲撃確率への乗算軽減に使う。`gatherYieldBonus` は成功した資源採集だけに加算する。`foodAgingReduction` は `advanceFantasyFoodPreservation` が将来の経過時間へ適用する。

このモジュールは登録済み `FANTASY_ITEMS` を読み込まず、データ登録・環境・食料の相互参照による初期化循環を避ける。
