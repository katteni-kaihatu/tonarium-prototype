# 월드 저장 백업과 복구

RPG 저장은 `FantasyBackups`로 세계·시계·공동 사업·의뢰 원장·지명 의뢰와 Tonarium 로그인 전환 완료 표식을 함께 보관한다. 기본 대상은 `fantasy.json`, `fantasy-clock.json`, `fantasy-community.json`, `fantasy-contracts.json`, `fantasy-named-commissions.json`, `fantasy-platform-reset.json`이다. 별도 RPG 계정 파일은 백업하지 않는다. Tonarium 계정 DB나 다른 월드 자료는 대상이 아니다. RPG 백업은 개인 캐릭터 자료를 포함하므로 `DATA_DIR/fantasy-backups`를 웹 공개 경로에 넣지 않는다.

이번 로그인 전환의 첫 시작은 승인된 **이전 RPG 계정·캐릭터·모든 진행도와 RPG 전용 백업·진단 기록의 영구 삭제**를 먼저 실행한다. 그 뒤 새 백업을 시작한다. 이전 인증 정보를 다시 백업하거나 이전 캐릭터를 새 계정으로 이전하지 않는다. 정확한 삭제 범위와 완료 표식은 [RPG와 Tonarium 로그인](fantasy-accounts.md)을 참조한다.

실행 서버는 저장을 읽기 전에 `acquireRuntime()`으로 운영 잠금을 얻고, 시작·정상 종료 시 강제 체크포인트, 실행 중에는 5분 간격으로 변경된 스냅샷을 만든다. `createFantasyBackupSave()`는 첫 변경 전에 이전 파일 묶음을 보존한다. 최근 24개와 날짜별 최신 14일을 합쳐 보관하며 중복은 한 번만 센다. 각 파일의 크기·SHA256·완성 manifest를 기록하고 쓰기가 끝나야 폴더를 원자적으로 공개한다.

복구는 파일 크기·SHA256·JSON 객체와 완료 표식 버전을 확인한다. **완료 표식이 없거나 유효하지 않은 스냅샷은 복구하지 않는다.** 표식도 진행도와 함께 복구하므로 다음 서버 시작에서 새 캐릭터를 다시 초기화하지 않는다. 이전 계정 형식의 백업은 현재 파일 목록과 맞지 않아 거절한다. 게임의 모든 도메인 규칙을 백업 도구가 다시 실행하는 것은 아니며 실제 저장 로더가 캐릭터·의뢰의 세부 스키마를 확인한다. 잘못된 JSON이나 스키마 오류를 빈 세계로 덮어쓰지 않는다.

다음 명령은 Node 24에서 명시한 데이터 폴더만 다룬다. 기본 실행은 목록·복구 계획만 출력한다.

```powershell
node --experimental-transform-types scripts/fantasy-backup.ts list --data-dir E:\tonarium2\data
node --experimental-transform-types scripts/fantasy-backup.ts backup --data-dir E:\tonarium2\data
node --experimental-transform-types scripts/fantasy-backup.ts restore --data-dir E:\tonarium2\data --snapshot <목록의-ID>
```

`backup`과 `restore`는 `--apply`를 붙여야 실제 파일을 쓴다. 복구와 수동 백업은 RPG 서버를 먼저 종료해야 하며 실행 중인 서버의 잠금이 있으면 거절한다. 복구 직전 파일 전체를 별도 스냅샷에 보존하고 현재 파일이 계획 이후 바뀌면 복구를 시작하지 않는다. 손상된 현재 파일도 원문을 격리 보관한다. 스냅샷에 없는 현재 저장을 지워 과거 상태로 맞추지 않고 해당 복구를 거절한다.

여러 파일 복원 도중 실패하면 이전 파일 묶음으로 되돌린다. 프로세스가 갑자기 종료되어 `restore-pending.json`이 남으면 서버 시작을 막고 운영자의 복구를 기다린다. 아래 명령도 기본 실행은 상태만 확인하고 `--apply`를 붙이면 복구 전 파일로 되돌린다.

```powershell
node --experimental-transform-types scripts/fantasy-backup.ts recover --data-dir E:\tonarium2\data
```

## 비정상 종료 뒤 남은 잠금

원자적 파일 교체와 잠금은 같은 호스트·프로세스 네임스페이스에서 한 데이터 폴더를 사용하는 단일 서버 운영을 전제로 한다. 여러 컨테이너가 같은 월드 볼륨에 동시에 쓰는 구성은 지원하지 않는다. 정상 종료는 잠금을 해제한다. 강제 종료 뒤의 `fantasy-backups/runtime.lock`, `fantasy-backups/restore.lock`은 PID가 재사용되면 살아 있는 잠금으로 보일 수 있다.

초기화 도중 강제 종료하면 `DATA_DIR/.fantasy-platform-reset.lock`이 남을 수 있다. 초기화는 이 잠금의 PID가 죽어 보여도 자동으로 지우지 않는다. 다른 호스트·컨테이너의 생존 여부를 알 수 없고 동시에 재시도한 두 프로세스가 서로의 잠금을 지울 수 있기 때문이다. 첫 전환 전에 기존 RPG 백업 잠금이 남아 있어도 초기화를 시작하지 않는다.

1. 해당 볼륨에 쓰는 모든 서버·관리 명령을 종료하고 자동 재시작·배포·예약 실행을 멈춘다. Docker에서는 호스트에서 같은 볼륨을 연결한 모든 컨테이너의 종료를 확인한다. 관리 컨테이너 안의 PID 목록만으로 판단하지 않는다.
2. 잠금에 기록된 PID·nonce와 원문을 운영 기록에 남긴다. 모든 쓰기 프로세스가 중지된 것을 확인한 뒤 **오류가 가리킨 정확한 잠금 파일만** 같은 비공개 디렉터리의 `.stopped-<UTC시각>` 이름으로 옮긴다. 잠금이 다시 생기면 다른 실행 주체를 먼저 찾는다.
3. 초기화 완료 표식 `fantasy-platform-reset.json`은 지우거나 직접 만들지 않는다. 잘못된 표식이 있으면 정상 완료 여부와 해당 버전을 먼저 확인한다. 새 진행도가 있는 상태에서 완료 표식만 없애면 다음 시작이 다시 초기화한다.
4. 일반 백업 복원 중 남은 `fantasy-backups/restore-pending.json`은 지우거나 이름을 바꾸지 않는다. 이미 로그인 전환이 완료된 저장소에서는 관리자 `recover`로 먼저 롤백한다. 아직 전환 전인 저장소의 RPG 백업과 미완성 복원 기록은 이번에 승인된 영구 초기화 대상이며, 기존 쓰기 프로세스를 모두 멈춘 뒤 첫 전환을 재시도한다.
5. 관리 작업을 끝내고 서버를 정확히 하나만 시작한다. 완료 표식이 아직 없는 초기화 실패는 남은 RPG 자료를 다시 지우고 마지막에 완료 표식을 기록한다. 표식이 이미 정상이라면 새 진행도는 유지한다.

심볼릭 링크나 데이터 폴더의 연결 경로는 초기화 전에 거절한다. 허용된 RPG 폴더 내부에 있는 링크도 거절하므로 외부 파일을 따라가 삭제하지 않는다. 백업 SHA256는 손상 검사용이며 장비 고장 대비 원격 백업은 운영 환경에서 별도로 구성한다.

운영 Docker 이미지에는 백업·진단 관리 스크립트가 포함된다. 관리할 때는 서버를 멈추고 같은 데이터 볼륨을 연결한 일회성 관리 컨테이너에서 `--data-dir /app/data`를 사용한다. 이미지를 바꿀 때도 기존 볼륨을 그대로 연결해야 완료 표식과 새 RPG 진행도가 이어진다.
