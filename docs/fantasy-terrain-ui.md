# 지형과 계절에 반응하는 화면

현재 위치를 기준으로 게임 패널과 NPC 대화창의 색이 달라진다. 목적지를 선택해 미리 보는 것만으로 현재 화면의 색은 바뀌지 않는다. 실제 여행을 시작하면 현재 이동 구간의 진행률에 따라 출발지와 도착지 색이 서서히 이어진다. 여러 지역을 거칠 때도 각 구간의 실제 예정 시간과 중간 위치를 사용한다. 해상 구간에서는 출항·접안 때만 해안과 바다의 색을 연결하고, 먼바다에서는 바다 팔레트 하나를 사용한다.

## 기본 팔레트

[Coolors Pastel](https://coolors.co/palettes/trending/pastel)과 Trending에서 확인한 팔레트 중 밝은색을 사용한다. 한 지형에는 아래 원본 팔레트 하나만 배정하며, 원본의 진한색은 사용 색상에서 제외한다. 계절은 같은 팔레트의 색 비중과 밝기로 표현하고, 여행 중에는 출발·도착 지형의 두 상태만 보간한다. 글자용 어두운 중성색은 가독성을 위해 별도로 유지한다.

| 지형 | 팔레트 | 기본 색 |
|---|---|---|
| 도시·마을 | [Soft Sand](https://coolors.co/palette/edede9-d6ccc2-f5ebe0-e3d5ca-d5bdaf) | `#EDEDE9 #D6CCC2 #F5EBE0 #E3D5CA #D5BDAF` |
| 숲 | [Natural Harmony](https://coolors.co/palette/75dbcd-c9dbba-dcdba8-f5cda7-faa381) | `#75DBCD #C9DBBA #DCDBA8 #F5CDA7 #FAA381` |
| 설원 | [Blue Serenity](https://coolors.co/palette/edf2fb-e2eafc-d7e3fc-ccdbfd-c1d3fe-b6ccfe-abc4ff) | `#EDF2FB #E2EAFC #D7E3FC #CCDBFD #C1D3FE #B6CCFE #ABC4FF` |
| 바다 | [Ocean Blue Serenity](https://coolors.co/palette/03045e-023e8a-0077b6-0096c7-00b4d8-48cae4-90e0ef-ade8f4-caf0f8) | `#48CAE4 #90E0EF #ADE8F4 #CAF0F8` |
| 해안·항구 | [Pastel Fantasy](https://coolors.co/palette/7bdff2-b2f7ef-eff7f6-f7d6e0-f2b5d4) | `#7BDFF2 #B2F7EF #EFF7F6 #F7D6E0 #F2B5D4` |
| 섬 | [Pastel Dreams](https://coolors.co/palette/ff99c8-fcf6bd-d0f4de-a9def9-e4c1f9) | `#FF99C8 #FCF6BD #D0F4DE #A9DEF9 #E4C1F9` |
| 산악 | [Light Steel](https://coolors.co/palette/f8f9fa-e9ecef-dee2e6-ced4da-adb5bd-6c757d-495057-343a40-212529) | `#F8F9FA #E9ECEF #DEE2E6 #CED4DA #ADB5BD` |
| 동굴 | [Subtle Pastel Hues](https://coolors.co/palette/eae4e9-fff1e6-fde2e4-fad2e1-e2ece9-bee1e6-f0efeb-dfe7fd-cddafd) | `#EAE4E9 #FFF1E6 #FDE2E4 #FAD2E1 #E2ECE9 #BEE1E6 #F0EFEB #DFE7FD #CDDAFD` |
| 유적 | [Golden Summer Fields](https://coolors.co/palette/ccd5ae-e9edc9-fefae0-faedcd-d4a373) | `#CCD5AE #E9EDC9 #FEFAE0 #FAEDCD` |
| 습지 | [Soft Serenity](https://coolors.co/palette/e8d7ff-ffd3e8-ffd7d5-f3ffe1-dfffd6) | `#E8D7FF #FFD3E8 #FFD7D5 #F3FFE1 #DFFFD6` |
| 사막 | [Soft Peachy Delight](https://coolors.co/palette/fec5bb-fcd5ce-fae1dd-f8edeb-e8e8e4-d8e2dc-ece4db-ffe5d9-ffd7ba-fec89a) | `#FEC5BB #FCD5CE #FAE1DD #F8EDEB #E8E8E4 #D8E2DC #ECE4DB #FFE5D9 #FFD7BA #FEC89A` |
| 화산 | [Pastel Bliss](https://coolors.co/palette/ffb5a7-fcd5ce-f8edeb-f9dcc4-fec89a) | `#FFB5A7 #FCD5CE #F8EDEB #F9DCC4 #FEC89A` |
| 마탑 | [Pastel Dreamland Adventure](https://coolors.co/palette/cdb4db-ffc8dd-ffafcc-bde0fe-a2d2ff) | `#CDB4DB #FFC8DD #FFAFCC #BDE0FE #A2D2FF` |

## 계절과 장식

- 숲: 봄·여름의 잎, 가을의 황토색 단풍, 겨울의 앙상한 가지와 옅은 적설.
- 설원: 눈과 서리, 여름에는 눈 입자와 얼음 장식을 줄인 해빙 표현.
- 바다·해안·섬: 가장자리 물결과 섬의 식생.
- 산악·동굴·유적·습지·사막·화산·마탑·도시: 능선, 결정, 무너진 석조물, 갈대와 안개, 모래언덕, 불씨, 문양, 건물 윤곽.
- 실제 날씨에 따라 비나 눈을 가장자리에 소량 표시한다. 동굴과 마탑에는 야외 강수를 표시하지 않으며, 야외 유적에는 날씨를 반영한다.

장식은 클릭을 가로채지 않고 스크린리더에 읽히지 않는다. 중앙의 대화·지도 영역은 비워 두며, 모바일에서는 입자를 줄인다. 운영체제의 ‘동작 줄이기’ 설정에서는 낙하·물결·색상 전환 애니메이션을 멈추고 정적인 계절 표현을 유지한다. Tonarium의 다른 월드나 시작 화면에는 적용하지 않는다.

## 가독성

본문·보조 설명은 밝고 불투명한 배경 위에 놓는다. 주요 버튼과 캐릭터 패널도 밝은 배경과 읽기 쉬운 중성색 글자를 사용한다. 각 계절과 여행 중 보간한 색에서 최소 4.5:1 대비를 유지하도록 글자색을 보정한다. 비활성 버튼은 전체 투명도를 낮추는 대신 읽을 수 있는 글자와 점선 테두리로 구분한다. HP·MP·상태 이상·오류와 같이 의미가 있는 기존 상태색은 유지한다.

펼친 메뉴는 지도와 메뉴에 배정된 공간 중 약 44%를 사용한다. 메뉴 본문은 15.5px, 탭은 14px, 버튼은 14.5px, 보조 글자는 12px로 키웠다. 작은 화면에서는 메뉴를 세로로 배치하고 헤더 버튼이 줄바꿈되어 글자가 잘리지 않게 한다.

## 검증

`npm run test:fantasy-terrain`으로 경유지·중단 위치·해상 이동·계절 팔레트·대비·장식 입자 수·모바일·동작 줄이기를 검사한다. 팔레트와 대비 계산은 `client/src/world/fantasy-terrain-theme.ts`, 장식은 `FantasyTerrainAmbience.tsx`, 게임 및 별도 대화창의 적용은 `fantasy-terrain.css`에 있다.

## 탐사한 지역 사이의 안개

서로 가까운 지역들을 실제로 방문했다면 그 사이의 연결부와 둘러싸인 공간도 밝힌다. 미방문 지역까지 포함해 만든 지형 연결망을 사용하므로, 알고 있는 세 지점만으로 멀리 있는 미탐사 구역을 넓게 드러내지 않는다. 자동으로 연결하는 범위는 같은 대륙의 가까운 지역에 한정하며 해안선 밖으로 나가지 않는다. 섬 사이와 다른 대륙까지 이어서 바다를 전부 밝히지 않는다. 지도 구입으로 드러나는 기존 범위는 유지한다.

이동 중에는 실제로 지나온 경로까지만 밝히고 전이문은 중간 지형을 드러내지 않는다. 모든 범위를 한 마스크로 합친 뒤 가장자리를 한 번 처리하므로, 밝힌 원들이 겹치는 경계가 별도의 어두운 고리로 남지 않는다. `npm run test:fantasy-map`으로 미지의 이웃 지역, 먼 지역, 해상 경계, 부분 이동과 대륙 배치를 검사한다.

## 노크티스의 해협

시작 대륙과 간격을 넓히기 위해 노크티스 전체를 지도에서 오른쪽으로 80만큼 이동했다. 묵향도시를 포함한 10개 지역, 해안선, 대륙명, 강과 산림 장식이 함께 이동하며 대륙 내부의 상대적인 배치는 유지한다. 다른 대륙과 섬은 옮기지 않는다. 위치 ID와 기존 저장 데이터, 노선의 정해진 운임·소요 시간도 유지한다. 화면 범위는 기존 1800×1200이고 지도를 끌거나 ‘전체’ 버튼으로 전체 지역을 볼 수 있다.
