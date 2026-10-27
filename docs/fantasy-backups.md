# 월드 저장 백업과 복구

RPG 저장은 `FantasyBackups`로 세계·시계·공동 사업·의뢰 원장·월드 계정을 함께 보관한다. 기본 대상은 `fantasy.json`, `fantasy-clock.json`, `fantasy-community.json`, `fantasy-contracts.json`, `fantasy-accounts.json`이다. Tonarium의 다른 데이터나 정적 에셋은 건드리지 않는다. 백업에는 계정 인증 정보도 들어가므로 `DATA_DIR/fantasy-backups`는 운영자만 접근하고 웹 공개 경로에 넣지 않는다.

실행 서버는 저장을 읽기 전에 `acquireRuntime()`으로 운영 잠금을 얻고, 시작·정상 종료 시 강제 체크포인트, 실행 중에는5분 간격의 변경된 스냅샷을 만든다. `createFantasyBackupSave()`는 첫 변경 전에 이전 파일 묶음을 보존한다. 최근24개와 날짜별 최신14일을 합쳐 보관하며 중복되는 스냅샷은 한 번만 센다. 스냅샷마다 파일 크기·SHA256·완성 manifest를 기록하고, 쓰기 완료 뒤 폴더를 원자적으로 공개한다. 미완성 임시 폴더나 검증할 수 없는 자료를 정상 복구 후보로 사용하지 않는다.

저장 파일의 잘못된 JSON이나 스키마 오류를 빈 세계로 초기화하지 않는다. 읽기 실패는 기존 저장을 보존한 채 서버의 오류 처리로 넘긴다. 정상 스냅샷이 없으면 자동 복구를 추측하지 않는다. 아래 명령은 프로젝트의 Node24 런타임에서 실행하며 명시한 데이터 폴더만 다룬다. 기본적으로 목록·복구 계획만 출력한다.

백업의 기본 검증은 파일 크기·SHA256·JSON 객체 형식과 복원 가능한 계정 원장 버전을 확인한다. 게임의 모든 도메인 규칙을 백업 도구가 다시 실행하는 것은 아니며, 복구 뒤 실제 저장 로더가 캐릭터·의뢰·계정 등의 세부 스키마를 확인한다. 로더가 거절하는 자료를 빈 저장으로 덮어쓰지 않는다. 이전 브라우저 소유자 이전은 별도로 임시 저장소에서 실제 도메인 로더까지 확인한 뒤 적용한다.

```powershell
node --experimental-transform-types scripts/fantasy-backup.ts list --data-dir E:\tonarium2\data
node --experimental-transform-types scripts/fantasy-backup.ts backup --data-dir E:\tonarium2\data
node --experimental-transform-types scripts/fantasy-backup.ts restore --data-dir E:\tonarium2\data --snapshot <목록의-ID>
```

`backup`과 `restore`는 `--apply`를 붙여야 실제 파일을 쓴다. 복구와 수동 백업은 RPG 서버를 먼저 종료해야 하며 실행 중인 서버의 잠금이 있으면 거절한다. 복구 직전 파일 전체를 별도 스냅샷에 보존하고, 현재 파일이 계획 이후 바뀌면 복구를 시작하지 않는다. 손상된 현재 파일도 버리지 않고 원문을 격리 보관한다. 스냅샷에 없는 현재 계정 파일 등을 지워서 과거 상태로 맞추지 않으며 해당 복구를 거절한다.

전체 복구 시 계정 파일은 스냅샷의 원본 SHA256를 먼저 확인한 다음, 로그인 세션과 이전 캐릭터 등록 코드 목록만 비운 상태로 복원한다. 계정·캐릭터 소유자·비밀번호 및 복구 코드의 해시는 보존한다. 이미 폐기한 로그인 쿠키나 사용한 등록 코드가 과거 백업 때문에 다시 살아나지 않으며, 모든 사용자는 새로 로그인해야 한다. 필요한 이전 캐릭터 등록 코드는 운영자가 다시 발급한다. 미리보기의 `restoredHash`는 이 처리를 마친 실제 복원 내용의 해시다. 일반 백업·정상 저장·소유자 이전·실패 후 롤백은 이 처리를 하지 않고 원문을 그대로 보존한다.

여러 파일 복원 도중 실패하면 이전 파일 묶음으로 되돌린다. 프로세스가 갑자기 종료되어 `restore-pending.json`이 남으면 서버 시작을 막고 운영자의 복구를 기다린다. 다음 명령의 기본 실행은 상태만 확인하며, `--apply`를 붙이면 복구 전 보존한 파일로 되돌린다. 이후 원하는 정상 스냅샷 복구를 다시 진행한다.

```powershell
node --experimental-transform-types scripts/fantasy-backup.ts recover --data-dir E:\tonarium2\data
```

원자적 파일 교체와 위 잠금은 한 저장 디렉터리를 사용하는 단일 RPG 서버 운영을 전제로 한다. 백업의 SHA256는 손상 검사용이며 외부 저장소 복제나 장비 자체의 고장 대비 원격 백업은 운영 환경에서 별도로 구성한다. PID 잠금은 같은 호스트·프로세스 네임스페이스에서 살아 있는 프로세스를 확인하는 보수적인 가드다. 같은 네임스페이스의 두 번째 서버는 거절하지만, 서로 다른 컨테이너의 PID만으로 실제 소유 프로세스를 구별할 수는 없다. 여러 실행 중인 컨테이너가 같은 세계 볼륨을 공유하는 구성은 지원하지 않는다.

운영 Docker 이미지에는 두 관리 스크립트도 포함한다. 컨테이너 환경에서 적용할 때는 게임 서버 컨테이너를 먼저 멈추고, 같은 데이터 볼륨을 연결한 일회성 관리 컨테이너에서 스크립트와 `--data-dir /app/data`를 사용한다. 서로 다른 데이터 볼륨에 실행하면 현재 세계의 백업이나 이전이 되지 않는다. 이미지를 교체할 때에도 기존 데이터 볼륨을 그대로 연결하며, 시작 전 백업을 보관한 뒤 새 서버를 실행한다.

## 비정상 종료 뒤 남은 잠금

정상 종료는 잠금을 해제한다. 강제 종료·호스트 재시작·컨테이너 재생성 뒤에는 이전 `runtime.lock` 또는 `restore.lock`이 남을 수 있다. 새 컨테이너가 이전과 같은 PID를 받으면 실제 옛 서버가 없어도 프로그램은 잠금을 자동으로 지우지 않는다. 다른 네임스페이스에서 그 PID가 살아 있거나 죽었다는 사실만으로 다른 컨테이너의 종료를 증명할 수 없기 때문이다. 오류에는 확인할 잠금의 절대 경로가 표시된다. `runtimeActive` 상태도 이 경우 실제 서버가 있다는 확정 증명이 아니라 저장된 PID에 대응하는 프로세스가 보인다는 뜻이다.

운영자는 다음 순서로 쓰기 프로세스를 확실히 차단한 뒤 잠금을 격리한다. 이 절차를 자동 재시작 중에 수행하거나 살아 있는 서버의 잠금을 우회하는 용도로 사용하지 않는다. 강제 복구 플래그는 제공하지 않는다.

1. 해당 데이터 폴더를 쓰는 서버·관리 명령을 모두 종료하고 자동 재시작·예약 실행·배포 자동화를 잠시 중지한다. Docker에서는 **호스트에서** 같은 이름의 데이터 볼륨 또는 같은 바인드 경로를 연결한 모든 컨테이너를 찾아 종료 상태를 확인한다. 다른 프로젝트의 컨테이너도 포함한다. 일회성 관리 컨테이너 안의 PID 목록만 보고 판단하지 않는다.
2. 어떤 프로세스가 이 저장소를 쓰는지 확인할 권한이나 확신이 없다면 잠금을 변경하지 않는다. 모든 쓰기를 차단한 뒤 현재 데이터 폴더 전체를 별도의 비공개 위치에 보존한다. 계정 파일과 백업도 포함한다.
3. `DATA_DIR/fantasy-backups/runtime.lock`과 `DATA_DIR/fantasy-backups/restore.lock`의 PID·시각·nonce를 운영 기록에 남긴다. 두 파일 중 실제 남아 있는 것만 `.stopped-<UTC시각>` 같은 이름으로 같은 비공개 폴더에 옮겨 원문을 보존한다. 세계 저장·계정 파일·스냅샷 폴더는 옮기거나 삭제하지 않는다.
4. **`DATA_DIR/fantasy-backups/restore-pending.json`은 지우거나 이름을 바꾸지 않는다.** 이 파일이 있으면 관리자 `recover` 명령으로 먼저 계획을 확인하고, 명시적인 `--apply`로 이전 파일 묶음에 되돌린다. 그 후 필요한 정상 스냅샷 복구를 다시 수행한다.
5. 관리 명령과 관리 컨테이너를 모두 종료한 뒤 세계 서버를 정확히 하나만 시작한다. 같은 저장소의 다른 서버를 다시 자동 기동하지 않도록 배포 구성을 확인한 후 자동 재시작을 되살린다.

Windows 호스트에서 1~3단계의 종료·보존 확인을 이미 마쳤다면, 다음은 남은 잠금 파일만 격리하는 예시다. 이 명령 자체는 서버 종료를 증명하지 않는다. 경로는 실제 `DATA_DIR`로 바꾼다.

```powershell
$worldDataDirectory = 'E:\tonarium2\data'
$worldLockDirectory = [IO.Path]::GetFullPath((Join-Path $worldDataDirectory 'fantasy-backups'))
$worldLockStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff')
foreach ($worldLockName in 'runtime.lock', 'restore.lock') {
  $worldLockPath = Join-Path $worldLockDirectory $worldLockName
  if (Test-Path -LiteralPath $worldLockPath) {
    Get-Content -LiteralPath $worldLockPath
    Move-Item -LiteralPath $worldLockPath -Destination "$worldLockPath.stopped-$worldLockStamp"
  }
}
```

컨테이너에서도 동일하게 호스트 차원의 쓰기 차단을 먼저 확인하고, 같은 볼륨을 연결한 단 하나의 관리 컨테이너에서 정확한 두 잠금 파일만 격리한다. 잠금이 다시 생기면 다른 실행 주체가 있다는 신호이므로 반복해서 치우지 말고 운영 구성을 재확인한다.

이전 브라우저 ID의 캐릭터를 월드 계정으로 옮길 때는 서버를 종료한 상태에서 운영자의 이전 절차를 거친다. `migrateFantasyLegacyOwner`는 기존 UUID 소유자를 새 `fantasy:<uuid>` 전용 소유자로 바꾸며 기본 호출은 읽기 전용 계획이다. 적용 시 세계·시계·계정·공동 사업·의뢰 원장을 묶어 백업한 다음, 캐릭터 키와 부동산·거래·법 집행·창고·전투·공유 의뢰의 실제 소유 참조를 함께 바꾼다. 새 소유자가 이미 쓰이고 있거나 자료 검증이 실패하면 적용하지 않는다.

이전은 사용자 표시 이름이나 기록 문장을 검색·치환하지 않는다. `UUID`와 `UUID-alt`는 서로 다른 소유자이며 정확한 식별자와 정의된 영수증·전투 참조만 옮긴다. 임시 폴더에서 실제 세계·공동 사업·의뢰 로더의 스키마 검사를 통과해야 적용할 수 있다. 도중 실패·중단 시 일반 복구와 같은 journal/롤백 규칙으로 처리한다. 이전 뒤 계정 등록 코드 발급이 실패하더라도 이전 브라우저 ID로 되돌리지 않고, 운영자가 새 전용 소유자의 코드를 다시 발급한다.
