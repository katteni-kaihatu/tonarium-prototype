# 공유 시스템을 중앙 라이브러리에 등록하기

중앙에 제출하는 것은 오브젝트가 아니라 **오브젝트·텍스트·사용자에 연결할 동작 시스템**입니다. 맵은 코드로 만들고, 시스템 ID와 대상 바인딩을 작성합니다. 모델이나 버튼 외형을 이 패키지에 넣지 않습니다. 시스템은 JSON으로 선언한 제한된 명령만 실행하며 JavaScript·설치 스크립트는 실행하지 않습니다.

## 처음 등록하는 순서

1. 저장소의 최신 `main`에서 작업 브랜치를 만들고 Node 24로 `npm ci`를 실행합니다.
2. 아래 명령으로 양식을 생성하고, 기능 설명·이용 조건·연결 대상·동작을 작성합니다.
3. 검사와 로컬 시험을 수행한 뒤 시스템 파일과 새 변경 이력 파일을 같은 PR에 넣습니다.
4. PR이 병합된 후 서버를 재배포합니다. GitHub 카탈로그와 실행 중인 서버의 `/api/shared-systems` 응답에서 새 항목과 원본을 확인합니다.

PR 제출은 저장소에 파일을 제출하는 단계입니다. 병합과 서버 재배포까지 끝나야 운영 중앙 라이브러리에 반영됩니다.

## 제출 파일과 참고 양식

```sh
npm run systems -- init my-button .
```

`shared-systems/my-button/1.0.0/system.json`이 생성됩니다. 기존 폴더는 덮어쓰지 않습니다. 생성된 양식은 클릭한 사용자를 `pressed` 이벤트로 전달하는 동작을 포함합니다. `description`의 안내 문구와 기본 `UNLICENSED`를 실제 설명·이용 조건으로 바꾸고 출처를 작성합니다.

| 항목 | 작성할 내용 |
| --- | --- |
| `schema`, `sdk` | 현재 값인 `1`, `tonarium-systems/1`을 사용합니다. |
| `id`, `version` | 폴더와 같은 ID·버전. ID는 영소문자로 시작하는 영소문자·숫자·하이픈 1~64자, 버전은 `1.0.0`과 같은 세 숫자입니다. |
| `title`, `description` | 표시 이름과 기능·사용 방법·제약·시간/거리 단위 설명. 맵 제작자가 무엇을 연결해야 하는지도 적습니다. |
| `license`, `credits` | 사용·수정·재배포 조건과 제작자·원작자 출처입니다. |
| `targets` | 역할 이름별 필요한 기능(`interact`, `move`, `text`, `seat`), 필수 여부 `required`, 여러 대상 허용 여부 `multiple`입니다. |
| `config` | 맵 제작자가 조정할 설정. 필드별 `type`, `default`, 숫자의 `min`·`max`를 작성합니다. |
| `state` | 서버가 보존할 실행 상태. 설정과 같은 형식으로 자료형·초기값·범위를 작성합니다. 모든 방 참가자에게 공유되므로 비밀 정보는 넣지 않습니다. |
| `inputs`, `outputs` | 입력·출력 이름과 `payload` 필드별 자료형입니다. 데이터가 없어도 `payload: {}`를 작성합니다. |
| `handlers` | 입력이 발생할 때 순서대로 실행할 명령입니다. 필요하면 `$mount`, `$dispose`, `$leave`를 작성합니다. |
| `interaction` | 선택 항목. 오브젝트와 상호작용할 `target` 역할과 호출할 `input`을 연결합니다. |
| `migrations` | 선택 항목. 이전 버전의 상태 필드 이름을 바꿀 때 `from`과 `renameState`를 작성합니다. |

필드·역할·입출력 이름에도 ID 규칙을 적용합니다. `constructor`, `prototype`은 사용하지 않습니다. 지원하지 않는 필드를 임의로 추가하지 않습니다. 비어 있는 `config`, `state`, `targets`, `inputs`, `outputs`, `handlers`도 해당 객체를 생략하지 않고 `{}`로 작성합니다.

공간 크기·외형·배치·착석 기준점은 맵의 오브젝트 정의에 둡니다. 패키지 크기는 실제 원본 파일의 바이트 수이며 직접 선언하지 않습니다. 상세한 공통 계약은 [공통 규칙과 사용법](contracts.md), 자료형과 명령 구조는 `shared/system-types.ts`, 유효성 검사는 `shared/systems.ts`를 참고합니다. 현재 명령으로 표현할 수 없는 새 동작은 SDK 확장 작업으로 진행합니다.

시스템 패키지에는 `system.json`만 허용합니다. 외부 URI·코드 파일·심볼릭 링크·미해결 LFS pointer는 허용하지 않습니다. 생성되는 패키지에는 이미지·GLB·애니메이션 파일이나 별도 설치 프로그램을 넣지 않습니다.

## 세 가지 기본 예제와 맵 연결

| 중앙 시스템 ID | 참고 파일 | 맵에서 연결하는 내용 |
| --- | --- | --- |
| `button` | [button 카탈로그](systems/button.md) | `target`에 상호작용할 오브젝트를 연결합니다. 클릭 시 `pressed`의 `user`로 클릭한 사용자를 전달합니다. |
| `timer` | [timer 카탈로그](systems/timer.md) | 선택 대상 `display`에 텍스트를 연결하고 `duration`을 초 단위로 설정합니다. 입력은 `start`, `pause`, `reset`, 출력에는 `finished`가 있습니다. |
| `chair` | [chair 카탈로그](systems/chair.md) | `seat`에 착석 기준 오브젝트를 연결합니다. `sit`·`stand`에 실제 접속자의 `user`를 전달합니다. |

전체 코드 예제는 `shared/system-demo.ts`입니다. 예제의 버튼 세 개는 각각 타이머 시작·일시정지·초기화에 연결합니다. 의자에는 `button`과 `chair`를 함께 배치해 오브젝트를 클릭한 사용자가 앉도록 연결합니다. 같은 시스템을 여러 번 쓸 때도 `instanceId`와 바인딩을 각각 지정하므로 서로 다른 오브젝트를 조작할 수 있습니다.

기본 아이템 모델을 사용할 때는 맵 코드에 `.item({ id: 'my-display', itemId: 'note', position: [0, 0, -2], itemMode: 'system', capabilities: ['text'] })`로 배치하고, 타이머의 `display`에 `my-display`를 연결합니다. `itemId`는 지원하는 기본 아이템 ID, `id`는 그 맵의 고유 배치 ID입니다. 공유 시스템에서는 기본 아이템 12종을 지원하며 스토어 상품과 미디어 아이템은 제외합니다. 기본 `native` 모드는 기존 아이템 기능을 유지하므로 시스템 대상으로 연결하지 않습니다. 시스템이 제어할 모델은 `itemMode: 'system'`과 실제 필요한 기능을 명시합니다. 바닥 배치, 지원 ID, 모드별 동작·저장 규칙은 [아이템 ID 배치 안내](contracts.md#아이템-메뉴의-아이템을-id로-배치)를 따릅니다. 새 중앙 시스템을 등록할 때 기존 모델을 패키지에 복사할 필요가 없습니다.

예를 들어 새로 등록한 `my-button`을 사용하려면 맵 코드의 `systemId`에 해당 ID를 넣습니다. 중앙 파일을 맵 프로젝트에 설치하거나 복사하지 않습니다.

```ts
.object({
  id: 'my-switch', capabilities: ['interact'], position: [0, 1, -2],
})
.system({
  instanceId: 'my-start', systemId: 'my-button',
  bindings: { target: ['my-switch'] }, config: {},
})
.connect({
  from: 'my-start', output: 'pressed', to: 'countdown', input: 'start',
})
```

이 조각은 `createSystemMap(...)` 체인에 넣는 예시이며, `countdown` 타이머 배치와 표시 오브젝트도 같은 맵에 선언해야 합니다. 전체 시작·타이머·의자 코드는 [코드에서 맵 작성](../../.claude/skills/add-world/SKILL.md)을 참고합니다. 맵을 `server/system-maps.ts`에 등록한 뒤 `loadSystemMap(맵ID)`로 불러옵니다.

## 로컬 검사와 PR 제출

```sh
npm run systems -- validate .
npm run docs:shared-systems
npm run check:shared-systems-docs
npm run test:systems
npm run test:systems-playtest
```

기준 체크아웃과 공개된 버전의 보존까지 비교하려면 다음과 같이 실행합니다.

```sh
npm run systems -- validate . ../trusted-main
```

`npm run dev:systems`로 시험 화면을 열고 [로컬 확인 순서](playtest.md)를 따릅니다. 새 시스템의 실제 동작 시험에는 `shared/system-demo.ts`에 시험용 오브젝트·배치·연결을 추가하거나 별도 코드 맵을 작성해야 합니다. 등록 목록에서 보이는 것만으로 동작 시험이 끝난 것은 아닙니다. 초기 상태, 반복 입력, 여러 배치와 사용자, 잘못된 연결, 타이머의 정지·재시작, 퇴장·재접속, 새 버전 갱신 후 상태 보존을 기능에 맞게 확인합니다.

작업 날짜에 맞는 `changelog/YYYY-MM-DD-my-system.json`을 새로 작성합니다. 예시 형식은 다음과 같습니다. 기존 변경 이력은 수정하지 않습니다.

```json
{
  "date": "2026-10-26",
  "title": "새 공유 버튼 시스템 추가",
  "items": ["맵 오브젝트를 연결해 클릭한 사용자를 전달하는 my-button 시스템을 추가했습니다."],
  "tag": "공유 시스템"
}
```

`npm run check:completion`으로 변경 이력·형 검사·빌드를 확인한 뒤 작성한 시스템 디렉터리와 새 변경 이력, 필요한 시험 코드를 같은 PR로 제출합니다. PR 설명에는 시스템 ID·새 버전, 기능과 연결 방법, 사용 조건과 출처, 실제 수행한 검사를 적습니다. 맵 예제를 추가했다면 위치도 적습니다. 앱 업로드·관리자 승인·새 계정·맵 편집 권한 기능은 없습니다. GitHub의 기존 제출·병합 정책을 사용합니다.

전용 workflow는 읽기 전용 `pull_request`에서 기준 브랜치의 검증기만 실행합니다. 검증에 필요한 의존성은 기준 브랜치의 `trusted` 체크아웃에서만 `npm ci --ignore-scripts`로 설치합니다. 제출 PR에서는 데이터 디렉터리를 별도 체크아웃하고, 읽기 권한만 사용하며, 제출한 코드나 설치 스크립트를 실행하지 않습니다. 시스템 번들 산출물의 생성·업로드는 `main`의 `push`에서만 실행합니다. 최초 도입 PR의 전용 workflow는 기준 브랜치에 아직 없으므로 일반 Web checks의 코드 시험으로 검사하고, 병합 이후 제출부터 전용 검증이 적용됩니다.

## 기존 시스템을 업데이트하기

공개한 `shared-systems/my-button/1.0.0/system.json`은 수정·삭제·이름 변경하지 않습니다. 새 폴더 `shared-systems/my-button/1.1.0/system.json`에 복사한 뒤 manifest의 `version`도 `1.1.0`으로 바꾸고 새 동작을 작성합니다. 같은 ID의 예전 버전을 함께 PR에 남깁니다. `init`은 첫 `1.0.0` 양식을 만드는 명령이므로 기존 ID를 업데이트할 때 다시 실행하지 않습니다.

기존 대상 역할·입출력·자료형·설정 범위를 유지하고, 새 필드에는 유효한 기본값을 지정합니다. 상태 이름을 바꿨다면 `migrations`를 작성합니다. 연결과 상태를 유지할 수 있는 새 버전만 실행 중 자동 적용되며, 호환되지 않는 버전은 기존 원본으로 계속 동작하고 진단을 남깁니다. 맵 제작자는 버전을 직접 고정하지 않고 `instanceId`·오브젝트 ID·바인딩을 유지합니다. 버전 번호만 올려도 로직의 의미가 안전하다는 보장은 없으므로 이전 입력 시나리오도 다시 시험합니다.

## 중앙에 등록된 내용 확인하기

등록된 이름·설명·사용법과 추가 설정·입출력 설명은 서버가 한국어·영어·일본어로 번역해 저장합니다. 원문 언어·고유명사·사람이 고친 번역은 `content-locales/metadata.json`으로 제출합니다. 원본 시스템 파일과 코드 ID는 유지합니다. 자세한 양식과 재처리 절차는 [콘텐츠 자동 번역 안내](../content-translations.md)를 따릅니다.

현재 저장소의 [공유 시스템 카탈로그](README.md)에서 원하는 ID를 선택합니다. 아이템과 시스템은 각각 한 항목당 하나의 Markdown 문서로 정리되어 있습니다. 일반 홈·세션에는 공유 시스템 메뉴를 제공하지 않습니다. 맵 제작 사용법은 [add-world](../../.claude/skills/add-world/SKILL.md)에 있습니다.

README의 색인이나 GitHub 검색으로 ID·이름을 찾고 개별 문서에서 필요한 대상·설정·입출력·사용 예제·원본을 확인합니다. 최신 계약과 이전 공개 버전을 같은 ID 문서에 모으므로 링크가 버전마다 바뀌지 않습니다.

같은 서버 주소의 `/api/shared-systems`는 현재 등록 카탈로그를 JSON으로 제공합니다. `entries`에 대상 ID·버전이 있는지 확인하고, 항목의 `integrity`를 `/system-originals/<integrity>`에 넣어 정확한 원본을 확인합니다. 원본 주소를 직접 맵의 시스템 ID 대신 사용하지 않습니다. `systemId`로 연결하면 서버가 중앙 원본을 해결합니다.

새 항목이 없다면 PR 병합 여부, 실행 중인 Docker 이미지의 재배포 여부, 서버의 영속 볼륨 경로, 시작 로그의 `System registration:` 오류를 차례로 확인합니다. 목록 조회에는 별도 업로드 계정이 필요하지 않습니다. 목록에서 삭제 버튼을 제공하지 않으며 공개된 원본은 기존 맵의 복구를 위해 보존합니다.

## 병합 후 중앙 서버 반영

기존 Coolify/Docker 배포를 사용합니다. Docker 빌드가 제출물을 다시 검증하고 `/app/system-bundle`에 카탈로그와 원본을 포함합니다. 서버 시작 시 이를 영속 볼륨의 `DATA_DIR/shared-systems/`에 보존하고 활성화합니다. 이 과정을 통해 별도 수동 업로드 없이 재배포한 서버의 읽기 전용 카탈로그에서 시스템을 사용할 수 있습니다.

배포 플랫폼에서 commit을 제공할 수 있으면 Docker build arg `SOURCE_COMMIT`에 정확한 40자리 commit을 지정합니다. 제공하지 않으면 실제 제출 내용으로 계산한 `content-sha256-...`를 release 식별자로 사용합니다. 이를 Git commit으로 표시하지 않습니다.

```sh
docker build --build-arg SOURCE_COMMIT=<merged-commit> -t tonarium .
```

서버는 `DATA_DIR`의 기존 영속 볼륨을 계속 사용해야 합니다. 원본은 `objects/sha256-...`, 제출 기록은 `releases/<release-id>.json`, 활성 카탈로그는 `current.json`입니다. 저장 도중 오류가 발생하면 기존 활성 카탈로그를 유지합니다. 한 번 공개한 같은 ID·버전의 bytes는 바꾸지 못하고 새 버전으로 제출합니다.

맵 제작자는 버전을 직접 고정할 필요가 없습니다. 시스템 ID로 사용하고, 실행기가 호환되는 새 버전에 상태·대상·연결을 유지해 갱신합니다. 호환되지 않으면 보존된 기존 버전으로 계속 작동하며 진단에 이유가 남습니다. 오래된 Docker 이미지로 돌아가도 영속 저장소에 이미 있는 새 버전 원본을 삭제하지 않습니다.

## 직접 운영하는 서버의 명령

자동 Docker 경로를 사용하지 않을 때 신뢰하는 체크아웃에서 실행합니다. 운영 프로세스와 같은 영속 볼륨을 지정합니다.

```sh
npm run systems -- publish . /absolute/data/shared-systems <merged-commit>
```

배포 파일을 따로 준비하려면 다음 명령을 사용합니다. 출력 폴더는 새 경로여야 합니다.

```sh
npm run systems -- prepare . ./system-bundle <merged-commit>
```

서버의 파일 조회는 해시가 일치하는 원본만 제공합니다. 외부 호스트의 실제 배포 실행은 해당 환경에서 수행해야 하며, 테스트 통과나 로컬 bundle 생성이 운영 배포 성공을 뜻하지 않습니다. 영속 볼륨 삭제·손실에 대비해 시스템 원본과 방 실행 상태를 함께 백업합니다.
