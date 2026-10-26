# 아이템·월드·공유 시스템 자동 번역

중앙 서버가 시작될 때 배포된 등록 정보를 확인하고 일본어·영어·한국어 번역을 생성합니다. 아이템·월드는 코드 등록표, 공유 시스템은 PR로 배포된 중앙 카탈로그가 기준입니다. 이용자가 목록을 열 때는 저장된 번역만 읽으며 번역 API를 새로 호출하지 않습니다. 번역을 기다리는 동안에도 게임과 목록을 사용할 수 있습니다.

대상은 아이템의 이름·설명·분류·사용법, 월드의 이름·소개·등록된 안내문, 공유 시스템의 제목·설명·사용법·설정과 대상·입출력의 보충 설명입니다. 마켓은 아이템·월드·사운드·감정 표현을 포함한 모든 상품의 이름과 설명을 수집합니다. 표시 언어는 Tonarium의 언어 설정을 따릅니다. 기존에 사람이 작성한 번역을 우선합니다. 사용자 이름·세션 이름·수정한 메모·실행 중인 텍스트·오브젝트 상태·코드는 보존합니다. 상품의 기본 안내문은 사용법·미리보기 화면에서 번역하고 실제로 배치되는 메모에는 원문을 사용합니다.

## 서버와 저장

기존 채팅 번역과 같은 `OPENAPI_KEY`를 사용합니다. `CONTENT_TRANSLATION_PROVIDER`와 `CONTENT_TRANSLATION_MODEL`이 없으면 채팅 설정을 이어받습니다. 운영 기본값은 `openai`와 `gpt-4o-mini`, 개발 기본값은 `mock`입니다. `off`는 자동 생성을 중지하고 채팅 제공자·선택 모델과 일치하는 저장 번역을 읽습니다. `mock`은 `[ko mock]` 같은 시험 결과를 만들며 번역 품질 검사용이 아닙니다. 제공자·모델별 캐시를 구분해 시험 결과가 운영 번역에 섞이지 않게 합니다.

저장 경로는 `DATA_DIR/content-translations/`이며 기본 Docker 영속 볼륨 `/app/data` 안에 있습니다. 재배포해도 성공한 번역을 재사용합니다. 원문·필드·문맥·원문 언어·보호할 이름·용어집·제공자·모델 설정이 같은 필드는 다시 번역하지 않습니다. 시스템의 로직 버전만 바뀌어도 번역을 재사용하며, 원문이 바뀐 필드에는 이전 번역을 표시하지 않습니다. 용어집이나 모델을 바꾸면 해당 규칙으로 다시 생성합니다.

작업은 최대 2개씩 별도 대기열로 처리하므로 채팅의 동시 요청 수를 사용하지 않습니다. 긴 설명은 요청당 2,000자 이내로 나눕니다. 실패한 결과는 성공으로 저장하지 않으며 원문 또는 기존 검토 번역을 표시합니다. 누락된 번역은 다음 시작이나 재처리 명령에서 다시 시도합니다. 공개된 시스템 원본·해시·맵 연결·이벤트·설정 ID·기본값·실행 상태는 변경하지 않습니다.

## 새 항목과 번역 교정

기본 아이템은 `shared/items.ts`, 기존 모델을 사용하는 별도 메뉴 항목은 `shared/item-variants.ts`, 사용법은 `shared/item-usage.ts`와 각 변형의 `usage`, 월드는 `shared/worlds.ts`, 마켓 상품은 `shared/market.ts`, 시스템은 기존 `shared-systems/<id>/<version>/system.json` 흐름으로 등록합니다. 새 항목은 다음 서버 배포에서 자동으로 발견합니다. 별도로 번역문을 모두 준비할 필요는 없습니다. 현재 마켓 상품 등록은 코드와 PR을 배포하는 방식이며, 별도의 상품 파일 업로드 API는 없습니다.

원문 언어·고유명사·추가 설명·수동 번역은 `content-locales/metadata.json`에 기록하고 같은 PR로 제출합니다. 키는 `item/chess`, `world/cafe`, `product/star-lounge`, `system/timer/1.0.1` 형식입니다. `sourceLanguage`는 `ja`, `en`, `ko`이며 생략하면 세 언어 모두 모델에 요청합니다. 이미 해당 언어인 원문을 유지하도록 요청합니다.

아래 항목을 기존 파일의 `entries`에 합칠 수 있습니다.

```json
{
  "system/timer/1.0.1": {
    "sourceLanguage": "ko",
    "protectedTerms": ["Tonarium"],
    "fields": {
      "title": { "source": "타이머", "translations": { "en": "Countdown timer", "ja": "タイマー" } },
      "usage": { "source": "버튼의 `pressed` 출력을 `start` 입력에 연결하세요." },
      "config.duration.label": { "source": "지속 시간" },
      "config.duration.description": { "source": "초 단위 시간이며 소수를 사용할 수 있습니다." },
      "inputs.start.description": { "source": "남은 시간부터 카운트다운을 시작합니다." }
    }
  }
}
```

`source`는 등록된 이름·설명의 원문과 정확히 일치해야 수동 번역을 사용합니다. 원문이 바뀌면 이전 수동 번역을 무시하고 새 번역을 요청합니다. 교정할 때는 `translations.en`, `translations.ko`, `translations.ja`를 고칩니다. 코드 버전을 발행하지 않고 표시 번역을 고칠 수 있습니다. 존재하지 않는 항목이나 설정 ID는 검사에서 거부합니다.

시스템의 추가 필드는 `usage`와 `targets.<ID>`, `config.<ID>`, `state.<ID>`, `inputs.<ID>`, `outputs.<ID>` 뒤에 붙이는 `.label`·`.description`입니다. 실제로 존재하는 ID만 참조합니다. 목록에서 코드 ID와 함께 표시하며 원본 JSON·코드 예문은 유지합니다. `glossary`는 용어별 목표 언어 표기, `protectedTerms`는 번역하지 않을 이름입니다. URL·백틱 코드·코드 블록·`{value}` 같은 자리표시자도 보호합니다.

아이템의 추가 사용법은 `usage`, 월드 안내문은 `instructions.<안내문ID>`로 등록합니다. 월드 카드에서 등록된 안내문을 펼쳐 읽을 수 있습니다. 월드 코드의 안내판에서도 표시하려면 같은 원문으로 다음 함수를 호출합니다.

```ts
import { worldInstruction } from '../content-translations.ts';
const label = worldInstruction('cafe', 'welcome', '카페에 오신 것을 환영합니다.');
```

`world/cafe`의 `instructions.welcome.source`에도 같은 문장을 등록합니다. 텍스트 렌더러에서 표시 언어를 구독합니다. 이미지에 그려진 글자나 3D 모델의 문구를 자동으로 찾아 교체하지는 않습니다. 일반적인 이름·소개·사용법 화면은 공통 번역 경로를 사용합니다.

## 검사와 다시 처리

```sh
npm run check:content-locales
npm run test:content-translations
npm run check:completion
```

`check:completion`에도 등록 정보 검사가 포함됩니다. PR 검사는 외부 번역 API를 호출하지 않습니다. 병합 후 서버 재배포 시 자동 생성합니다. 서버와 같은 환경변수·`DATA_DIR`에서 `npm run content:translate`로 누락된 번역을 다시 처리할 수도 있습니다. 명령이 끝나면 Tonarium 서버를 재시작해 저장된 결과를 카탈로그에 반영합니다. 키나 외부 오류의 원문은 브라우저·카탈로그·로그에 포함하지 않습니다.

`GET /api/content-translations`는 원문과 저장된 번역을 제공합니다. `pending: true`이면 작업 중이며 조회는 새 번역 작업을 만들지 않습니다. 일반 아이템·월드 화면은 작업 중일 때 제한된 횟수로 다시 읽습니다. 공유 시스템의 개발용 목록과 사용법은 [문서 폴더](shared-systems/README.md)에서 확인합니다. 로컬 개발 미리보기에서는 **목록 새로고침**으로 저장 번역을 다시 읽을 수 있습니다. 독립 `dev:systems`는 항상 모의 번역을 사용합니다.
