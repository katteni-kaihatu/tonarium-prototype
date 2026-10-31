# 職業HPと奥義

魔術師は長射程と範囲火力を持つ代わりにHPを抑え、戦士・騎士・盾持ちは前衛で受け止める余地を増やす。司祭は回復と支援、戦士は物理攻撃を軸とする。種族、体格、装備、レベルによる差は既存の計算をそのまま使う。

## 最大HP

`shared/fantasy-job-balance.ts` の倍率を、既存の最大HP計算の最後に1回だけ適用する。補正前HPが100の例では魔術師72、召喚士82、司祭95、戦士128、騎士135、盾持ち145となる。下限は20。

| 職業ID | 倍率 |
| --- | --- |
| mage | 0.72 |
| summoner | 0.82 |
| priest, assassin, spy, alchemist, scribe | 0.95 |
| unassigned, archer, thief, bard, merchant, tailor, weaver, gemcutter, herbalist | 1.00 |
| ranger, hunter, scout, smuggler, cook, leatherworker, baker, potter | 1.05 |
| spellblade | 1.08 |
| leader, crimeboss, carpenter, farmer, fisher | 1.10 |
| adventurer, blacksmith, shipwright | 1.15 |
| spearfighter, bandit | 1.20 |
| warrior | 1.28 |
| pugilist | 1.30 |
| knight | 1.35 |
| shieldbearer | 1.45 |

倍率や補正済みの最大HPはキャラクターに保存しない。転職時に`hp`を倍率で再計算したり、`permanentBonuses`へ職業HPを足したりしない。`fantasyJobMaxHp(job, unscaledMaxHp)`が毎回同じ元データから導出するため、転職や保存・再読込を繰り返しても倍率が累積しない。

転職・既存プロフィール読込・最大HPが下がった時は`fantasyClampJobHp(currentHp, maxHp)`で上限のみ整える。最大HPが上がってもこの関数では回復しない。HP0は0のまま残すため、瀕死や死亡を回復として扱わない。既存のレベルアップ時回復処理は別に維持する。

## 奥義の習得

`shared/fantasy-ultimate-skills.ts` は21職業の奥義を定義する。すべて既存の書籍解放を使い、**現在の職業の熟練600と、指定書籍の読了の両方**が必要。初期配布や一括習得は行わない。書籍を読んだだけでは他職の奥義を使えない。使用経験による既存の技能成長は最大+3で、命中支援は最大15。

| 職業 | 奥義 | 読書ID | 戦闘の役割 |
| --- | --- | --- | --- |
| 冒険者 | 地平突破 | field-signs | 射程3の物理貫通 |
| 戦士 | 天地断ち | martial-practice | 射程2の物理扇形攻撃 |
| 騎士 | 不滅の誓い | martial-practice | 味方1人の防護 |
| 槍使い | 竜脈貫き | martial-practice | 射程4の物理貫通 |
| 格闘家 | 泰山崩拳 | martial-practice | 近接の打撃と確率弱化 |
| 盾持ち | 最後の砦 | martial-practice | 強い防護 |
| 弓使い | 天雨の矢 | martial-practice | 射程7、半径1の矢雨 |
| 狩人 | 追跡の終着 | field-signs | 精密な単体射撃 |
| レンジャー | 森の矢雨 | field-signs | 射程5の物理扇形攻撃 |
| 斥候 | 嵐の足跡 | field-signs | 射程4の突進貫通 |
| 魔剣士 | 星断ちの刃 | advanced-mana-forms | 近接の物理円錐攻撃と確率沈黙 |
| 魔術師 | 落星大術式 | advanced-mana-forms | 射程7、半径2の魔法攻撃、MP38 |
| 召喚士 | 契約の星 | advanced-mana-forms | 遠隔の味方防護 |
| 吟遊詩人 | 英雄の終章 | words-and-promises | 味方1人の次の攻撃を支援 |
| 指導者 | 勝利の旗 | words-and-promises | 味方1人の次の攻撃を支援 |
| 盗賊 | 消える刃先 | shadow-and-risk | 近接攻撃と確率目くらまし |
| 暗殺者 | 無月の一撃 | shadow-and-risk | 精密な近接単体攻撃 |
| 山賊 | 峡谷砕き | shadow-and-risk | 打撃の円錐攻撃 |
| 密輸人 | 隠れ港 | shadow-and-risk | 味方1人の防護 |
| 密偵 | 決め手の合図 | shadow-and-risk | 味方1人の次の攻撃を支援 |
| 裏社会の頭領 | 最後の采配 | shadow-and-risk | 味方1人の次の攻撃を支援 |

近接の物理奥義を装備によって魔法へ変更しない。弓系奥義は弓・弩、槍系は長柄、盗賊・暗殺者・魔剣士は刃物、戦士は対応する近接武器が必要。防護・命中支援は生存中の味方1人に対して働き、蘇生や全体回復を付けない。通常の防護や命中支援の持続・非重複規則を使う。MP消費は既存の戦闘処理が負担し、新しい無料使用枠は設けない。

奥義は韓国語・英語・日本語の名前と説明を持つ。演出メタデータは技能IDごとに色、記号、モチーフを持ち、通常は1100ms、落星は1500ms。戦闘状態の保存形式へ独自の演出プロパティを足さず、クライアントが技能IDから`fantasyUltimateAnimation`で引く。司祭・聖人の奇跡は既存の信仰成長側で扱い、このカタログへ重ねて追加しない。生産職のHP差は上表で扱い、戦闘用の奥義は追加しない。

## 統合箇所

1. `shared/fantasy-engine.ts`の`fantasyStats`で、現在のHP式の結果を`fantasyJobMaxHp(character.job, rawHp)`へ渡す。転職処理・プロフィール読込時は必要に応じて現在HPを上限へ収める。
2. `shared/fantasy-data.ts`の`FANTASY_JOBS`構築時、各職業の`skills`へ`...fantasyUltimateJobSkills(job.id)`を追加する。これで既存の書籍・熟練判定、技能経験の保存検証、技能一覧へ登録できる。奥義モジュールの依存は型だけで、データカタログへの実行時循環参照を作らない。
3. `server/fantasy-combat-adapter.ts`で通常の武器条件とともに`fantasyUltimateWeaponReady(skill.id, attackContext.weapon)`を判定する。該当する奥義は`fantasyUltimateCombatSkill(skill.id, skill.power)`をそのまま返す。通常武器の`fantasyWeaponAttackProfile`へ通すと未知IDの範囲・射程が武器の既定値で上書きされるため、奥義はその前に分岐する。
4. 書籍本文の技能一覧は`FANTASY_SKILL_FIELD_BOOKS`にその職業が含まれる場合は既存の`fieldBook`生成から更新される。含まれない職業についても読書と熟練による技能判定自体は同じ書籍IDで動作する。学習案内では奥義カタログの書籍IDを併記する。
5. 戦闘演出側は`fantasyUltimateAnimation(skillId)`を参照する。実際に解決した奥義だけを再生し、選択しただけ・不発・MP不足では再生しない。画面復帰時は保存済み履歴を再演せず、動きを減らす設定では点滅や移動を止める。

## 未実施の確認

依頼の指定によりテスト、型チェック、ビルド、ブラウザ確認は実行していない。`CLAUDE.md`の完了時チェックも今回は実行対象外。統合後、実行が許可された段階で次を確認する。

- 同種族・同装備・同レベルの前衛と魔術師でHP差が上表どおりになる。
- 転職往復や保存・再読込で最大HP・現在HPが増殖せず、HP0を蘇生しない。
- 書籍のみ／熟練のみでは奥義が出ず、両方成立した現在職のみ使用できる。
- 奥義の経験値を持つ保存データが検証を通り、他職へ転職した場合は使えなくなる。
- 射程、範囲、物理・魔法区分、MP、武器条件、支援の非重複が実戦で一致する。
- 成功した技能と演出が対応し、三言語表示・演出軽減を含めて確認する。
