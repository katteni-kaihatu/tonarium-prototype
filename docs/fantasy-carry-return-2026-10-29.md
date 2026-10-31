# 동료 부축 · 간호 · 귀환의 등불

2026-10-29 구현 기록. 사용자의 지시에 따라 테스트·검사·타입 확인·빌드·브라우저 확인은 실행하지 않았다. 이 문서는 구현과 연결 계약을 기록하며 검증 완료를 뜻하지 않는다.

## 구현 파일

- `shared/fantasy-carry-return.ts`: 캐릭터 저장 필드의 타입, 필드 검증, 일반 던전의 귀환 허용 판정, KO/EN/JA 사유·기록 문구.
- `server/fantasy-carry-and-return.ts`: 원본을 변경하지 않는 명령 처리와 시간 경과 처리. 저장은 호출자가 모든 갱신을 한 번에 수행한다.
- `client/src/world/FantasyCarryReturnPanel.tsx`: 동료 부축·내려놓기·간호·귀환 초대와 동의 UI. 기존 파티 UI의 수정은 상위 작업이 담당한다.

## 저장 필드

`FantasyCharacter.carrying?: FantasyCarryState`는 `target`, `targetGeneration`, `generation`, `party`, `location`, 선택적인 `site`/`room`을 갖는다. 마지막 위치는 환자가 독립적으로 이동했는지 판정하고, 운반자의 승인된 이동을 환자에게 반영하는 기준이다.

`FantasyCharacter.returnLantern?: FantasyReturnLanternState`는 시전자에게만 저장한다. `party`, `generation`, `site`, `room`, `location`, `invited: {user,generation}[]`, `accepted: string[]`, `startedAt`, `endsAt`을 갖는다. 환자의 `carriedBy`와 동료가 보는 귀환 초대는 서버가 이 필드로부터 계산한다.

`validFantasyCarryReturn(character)`는 로컬 저장 모양과 시간 조건을 검사한다. 실제 파티 소속, 세대, 사망, 운반 관계는 서버 시간 경과 처리에서 확인한다.

## 서버 연결 계약

```ts
processFantasyCarryReturn(profiles, user, target, method, hour, { party, allies })
advanceFantasyCarryReturn(profiles, hour, contextForUser)
// 두 함수의 반환값:
// { profiles: Map<string, FantasyProfile>, updates: {user,profile}[], error?: string }
```

명령은 `carry | putDown | tend | returnInvite | returnAccept | returnDecline`이다. `contextForUser(user)`는 현재 인증된 실제 파티의 `{party,allies}` 또는 `undefined`를 반환한다. 같은 방에 있다는 사실만으로 파티 동의로 취급하지 않는다.

호출자는 세션·세계 인증을 확인한 뒤 명령을 실행하고 모든 `updates`를 원자적으로 검증·저장·배포해야 한다. 운반자의 이동이 확정된 뒤, 일반 빈사 만료보다 앞서 `advanceFantasyCarryReturn`를 실행해야 환자의 위치와 귀환을 같은 저장에 반영할 수 있다. 시전 중 일반 행동·그룹 이동 제한과 WebSocket `fantasyAid` 메서드 확장은 상위 작업이 담당한다. 오류 및 기록은 `fantasyCarryReturnText(source, locale)`로 표시한다.

## 행동

- 부축은 같은 실제 파티·장소·던전 방의 빈사 동료에게만 가능하다. 던전 레이아웃 시드도 같아야 한다. 한 사람이 한 명만 운반하고, 같은 환자를 두 사람이 운반할 수 없다.
- 운반 중에는 운반자의 장소·여행 위치·던전 방을 환자에게 반영한다. 환자의 해당 방은 실제 도착한 방으로만 기록하며 전투 승리·봉인 해제·의뢰 완료를 부여하지 않는다.
- 운반자나 환자의 세대·파티가 바뀌거나 사망·전투·환자 회복·만료가 발생하면 연결을 끊는다. 환자가 기준 위치에서 독립적으로 이동한 경우도 끊는다.
- 피해로 쓰러진 동료의 간호는 기존 회복 물약 한 개를 소비하고 만료까지의 시간을 2시간 늘린다. 세계 시간 1시간 간격이며 누적 `careHours`는 12시간을 넘을 수 없다. 무료 연타로 시간을 늘릴 수 없으며 희생 빈사는 간호 대상이 아니다. 간호 자체가 즉시 깨우거나 자동 회복 시각을 만들지는 않는다.
- 귀환의 등불은 현재 성자 사제이며 `miracle-return-lantern`을 준비한 사람만 시작한다. MP 45와 피로 35를 즉시 지불한다. 피로 100을 넘기며 비용을 일부만 지불하는 시전은 거절한다.
- `returnInvite`의 대상은 자기 자신이다. 즉시 3시간 기도를 시작하고 같은 방의 의식 있는 파티 동료에게 초대한다. 동료는 시전자를 대상으로 `returnAccept` 또는 `returnDecline`을 보낸다. 동의는 해당 세대·파티·방에 한정한다.
- 3시간 후 서버 틱에서 시전자·동의하고 같은 방에 남은 동료·그들이 정상적으로 부축 중인 빈사 동료를 해당 생성 레이아웃의 시작 방으로 옮긴다. `dungeon.active`를 유지하므로 던전 밖으로 나가려면 기존 출구 행동을 사용한다.
- 기도 중 조건이 바뀌면 취소하고 이미 지불한 비용을 돌려주지 않는다. 기도 중 부축·내려놓기·간호의 새 명령은 허용하지 않는다.
- 귀환은 기존 일반 던전 6종만 허용한다. 이야기·메인 장소 및 명시적인 봉인·귀환 금지 플래그를 거절한다. 새 던전을 자동 허용하지 않으며 봉인·수호자·의뢰 상태는 바꾸지 않는다.

## UI 연결 계약

`FantasyCarryReturnPanel`은 `{profile,selfId,peers,blocked?,onCommand(target,method)}`를 받는다. `peers`는 `{id,name,here?,downed?,downedKind?,carriedBy?,returnLantern?:{endsAt,invited,accepted}}[]`이다. `here`는 실제 장소와 던전 방의 일치 여부이며, 초대 표시는 현재 열람자 기준이다. 던전에서는 도시 여행자 목록 대신 인증된 파티 멤버에서 이 요약을 제공해야 한다.

## 파티 이동 연결

`server/fantasy-party.ts`의 여행·경로 변경·던전 제안 및 시작 판정을 변경했다. 유효하게 운반 중인 빈사 동료는 실제 파티 멤버로 계속 남지만 이동 계획과 의사 표시의 대상에서는 제외한다. 운반되지 않는 빈사 동료는 기존대로 공동 이동을 막는다. 전투·조사·파티 관리의 멤버 및 권한 판정은 변경하지 않는다.

제외 여부는 같은 실제 파티, 환자와 운반자의 현재 세대, 살아 있는 유일한 운반자, 유효 기간이 남은 빈사 상태, 전투 밖 상태, 저장된 운반 기준 위치, 현재 장소·던전 방·레이아웃 시드·여행 위치의 일치로 판정한다. 관계나 세대가 바뀌거나 환자가 깨어나 이동 참여자 구성이 달라지면 기존 제안은 무효화한다. 환자가 생기기 전에 만들었던 계획에서 동의를 자동으로 빼거나 새 동의를 만들어 내지 않는다.

운반자 한 명과 환자 한 명의 2인 파티는 능동적인 이동 참여자가 한 명이어도 제안할 수 있다. 실제 파티장이 유효하게 운반 중인 환자라면 살아 있는 이동 참여자를 임시 이동 조정자로 계산한다. 상태의 `movementLeader?: string`이 그 식별자이며 여행·던전 제안과 시작에만 적용한다. 실제 `leader`와 전투·추방·조사 권한은 유지한다. 이동 콜백의 문맥에는 이 이동 조정자를 `context.leader`로 전달한다.

제안의 저장·복원 및 `canStartTravel`·`canStartDungeon`·여행 시간은 능동적인 이동 참여자의 계획과 동의를 기준으로 계산한다. 운반 환자에게 요금·이동 시간·개별 행동을 강제로 부여하지 않으며, 승인된 이동 이후의 위치 반영은 저장소의 운반 동기화가 담당한다. 기존 멤버 및 퀘스트 문맥 목록을 줄이지 않는다.

연결 작업은 상위 담당자가 수행한다. 공유 `FantasyPartyState`에 `movementLeader`를 추가하고, 클라이언트의 여행·던전 제안/시작 권한 및 동의 인원 표시에 반영해야 한다. 저장소의 공동 이동 함수는 실제 파티와 운반 관계를 확인한 경우 능동 계획 한 개를 받아들여야 한다. 기존 여행 중 환자가 생긴 뒤 경로를 바꾸는 경우에는 기존 이동 코호트와 축소된 계획의 대응, 임시 이동 조정자의 리더 대응도 확인해야 한다. 이 저장소·클라이언트 연결은 이번 `fantasy-party.ts` 수정 범위에 포함하지 않았다.

## 실행 대기

사용자가 실행을 요청한 뒤, 원자적 저장 실패 시 롤백·동시 운반 거절·파티 및 세대 변경·이동 동기화·간호 물약 소비와 연타 제한·누적 한도·명시적 귀환 동의·불참자 잔류·시전 취소·생성 던전 시작점·이야기 봉인 거절을 검증한다. 타입 확인·빌드·완료 검사와 KO/EN/JA 브라우저 확인도 아직 실행하지 않았다.


## 전투 부축까지 연결
`shared/fantasy-combat-carry.ts`와 `server/fantasy-combat-carry-transfer.ts`를 통해 전투의 인접 부축/내려놓기, 이동 절반, 이동 기술 제한, 환자 기상/운반자 쓰러짐, 동반 도주, 같은 파티의 전투 밖 운반 이전을 추가했다. 기존 외부 환자도 한 명 제한을 점유한다. 프로토콜12. 자세한 실제 구현과 검증 대기는 `fantasy-saint-combat-handoff.md`를 따른다. 검증 실행은 아직 하지 않았다.
