# X-Piratez / OXCE native headless replay

## 기존 근사 시뮬레이터는 폐기되었습니다

`simulate.mjs`와 기존 `test.mjs`는 삭제되었습니다. 예전의 `--runs 5000` 명령, 자체 명중/피해 수식, 단순 AI, 근사 승률은 더 이상 실행하거나 사용하지 않습니다. Git 이력의 옛 버전을 복구하여 전술 근거로 사용하지 마세요. 현재 디렉터리에 근사 엔진으로 돌아가는 대체 실행 경로는 없습니다.

이 디렉터리는 **원본 OXCE C++ 엔진 전체 소스 + 헤드리스 입력/출력 어댑터**입니다. `native/oxce-source.tar.gz`에는 실제 개발 소스 스냅샷 963개 파일과 어댑터가 들어 있습니다. 게임 본체나 개인 세이브는 포함하지 않습니다. 소스 압축본은 2,857,359바이트(약 2.7MiB)입니다.

기본 빌드 구조·라이브러리는 OXCE 8.7.1 작업 트리에서 가져오고, 실제 프로젝트 개발 기준인 `XPZ_R42_ROTATION_LAB/RC18_CAMERA_SCROLL_FIX_SOURCE/src`의 832개 파일을 우선 적용했습니다. 이전 작업 트리로 되돌아가지 않도록 결합된 소스의 해시를 고정했습니다. 어느 소스에서 무엇을 가져왔는지는 매니페스트의 `sourceOverlayApplied`, `overlayFiles`와 `source.lock.json`으로 확인할 수 있습니다.

### 원본 엔진 승패 기록 (실험적 빌드)

원본 `BattlescapeState::finishBattle()` 메서드가 실제로 실행될 때만 `battle_finished` 이벤트를 발생시킵니다. **함수 진입 즉시**, 유닛 삭제·전리품 회수·다음 스테이지 생성보다 먼저 `xpz-native-battle-entry.sav`에 마지막 전투 상태를 보존합니다. 이어서 원본 메서드가 끝난 후 `xpz-native-battle-finish.sav`를 별도로 저장합니다. Game 루프는 메서드가 반환한 뒤 종료합니다. 게임의 전투 중 `tallyUnits()`를 단지 승률을 측정하기 위해 호출하지 않습니다. 그 함수는 일부 적의 항복 상태를 변경할 수 있으므로 관측을 위해 재호출하면 결과가 달라질 위험이 있습니다.

- `nativeMissionOutcome`: 원본 메서드에서 나온 `WON`, `LOST`, `ABORTED`, `NEXT_STAGE`, `PREVIEW` 중 하나입니다.
- `nativeBattleWonObserved=true`: 원본 승리 분기를 실제 통과했다는 기록일 뿐 사용자 GUI와의 완전 동등성 인증은 아닙니다.
- `NEXT_STAGE`는 **최종 승리가 아니라 다단계 미션 전환**이며 이후 단계 자동 이어하기는 아직 미지원입니다.
- `battleVictoryCertified=false`, `parityCertified=false`는 GUI 동등성 검증 완료 전까지 유지됩니다.
- 계획을 다 수행하면 `planCompleted=true`로 종료합니다. 실제 `finishBattle()`이 계획 중 발생하면 `planCompleted=false`, `nativeBattleFinished=true`와 별도의 최종 세이브 해시가 기록됩니다.
- 무손실·사망·기절 계산은 전투가 끝난 바로 그 순간의 `xpz-native-battle-entry.sav`에 있는 **원래 아군**으로 수행합니다. 이후 원본 엔진이 소환 유닛을 제거하거나 새 스테이지로 전환하더라도 생존자 목록이 누락되지 않습니다. 종료 후 상태 `xpz-native-battle-finish.sav`는 별도로 보존합니다. 반복 검증은 **진입 및 종료 두 전체 저장 파일**의 SHA-256을 모두 비교합니다.
- 두 저장 작업 전후의 게임플레이 RNG가 변하면 엔진 실행을 실패 처리합니다. 아직 다른 비RNG 상태에 대한 직렬화 부작용이 전혀 없다는 GUI 동등성 검증은 수행되지 않았습니다.

이 종료 관측 패치도 원본 GUI와 재생 비교를 통과하기 전에는 **실험 기능**입니다. 컴파일과 가짜 테스트만으로 승리 사례가 생성되지는 않습니다.

### `3.sav`와 RC17 원본 소스 일치 빌드

`3.sav`는 `v2026-10-25 R43-RC17-SKYRAMP-QUAD-FIX`에서 생성됐습니다. 기존 헤드리스 보관 소스에는 RC18 이후 변경이 섞여 있으므로, 이제 **RC17 원본 소스 전용 빌드**를 명시적으로 선택할 수 있습니다.

```sh
node tools/headless-simulator/build-native.mjs /tmp/xpz-native-rc17 2 rc17
```

원본 `native/oxce-source.tar.gz` 파일은 손대지 않습니다. `native/rc17-source-overlay.tar.gz` (196,043바이트)에는 서로 다른 **16개의 RC17 원본 소스/헤더**만 들어 있고, RC18에만 존재하는 신규 9개 파일은 RC17 빌드 단계에서 제거합니다. 아카이브와 교체 전후 SHA-256을 검사하며, 결과에는 `native-source-variant.json`과 `native-build.json.sourceVariantReceiptSha256`을 기록합니다. 헤드리스 명령 입력에 삽입된 `BattlescapeGame.cpp`, `Game.cpp`의 공통 훅은 유지합니다.

RC18 소스의 기본 빌드는 기존처럼 `build-native.mjs OUTPUT 2 rc18` 또는 마지막 인수 생략으로 유지합니다. GitHub Actions는 두 버전을 별도로 컴파일하며 각 실행 파일 이름에 `rc17`/`rc18`을 붙입니다. **RC17 소스 일치가 사용자의 RC17 게임 실행 파일과의 완전한 바이너리/GUI 동등성을 인증하는 것은 아닙니다.** 또한 원본 게임 리소스와 실제 네이티브 런타임 재생은 별도 검증이 필요합니다.

### `3.sav` 적 턴에서 발생하는 원본 사망·기절 확인창 처리

`3.sav`의 적 턴을 GPT Linux 원본 RC17 엔진으로 실행했을 때, 적 투척 이후 `InfoboxOKState`가 표시되며 헤드리스 입력을 기다려 **턴이 진행되지 않는 문제**를 관측했습니다. 원본 `InfoboxOKState::btnOkClick(nullptr)`는 `Game::popState()`를 호출하는 확인 동작이므로, 헤드리스 실행에서 원본 `think()` 후 그 알림창이 그대로 활성 상태일 때만 해당 핸들러를 호출합니다. 원본 `UnitDieBState`, `TileEngine`, `RNG`, `AIModule` 및 전투 계산은 변경하지 않습니다. 다른 UI 상태를 무조건 종료하지 않습니다.

이 수정은 코드 테스트와 Linux 컴파일을 통과한 뒤 실제 `3.sav` 재생으로 **다시 검증해야** 합니다. 이 확인창의 발생·닫힘만으로 피해량, 턴 완료 또는 승리를 확정하지 않습니다.

### 원본 엔진 결정적 시간 진행 (실험적 빌드)

원본 전투 로직은 `RNG`, `AIModule`, `TileEngine`, `Pathfinding`에서 그대로 실행합니다. 화면 없는 실행에서만 `Timer::slowTick()`을 벽시계 대신 **게임 루프마다 16ms 증가하는 고정 틱**으로 구동합니다. `Game::run`의 헤드리스 전용 `SDL_Delay(1)`도 제거합니다. 일반 GUI 경로의 시간 처리에는 변경이 없습니다.

이 패치는 **전투 규칙의 근사 구현이 아닙니다.** X-Piratez `HitFX-basic.rul`의 피해 효과 스크립트가 `animFrame`을 참조하므로, 기존 실행의 23개 저장 필드 불일치를 방치하지 않기 위한 수정입니다. 빌드 산출물은 `native-clock-patch.json`과 `native-build.json.clockPatchSha256`으로 수정된 Timer/Game 파일의 무결성을 고정합니다. 다른 버전의 바이너리로 실행하거나 비교하면 즉시 실패합니다.

고정 틱 적용 커밋 `494ad2b`의 **전체 Linux 컴파일은 GitHub Actions 실행 `40631715028`에서 성공**했고, 실행 파일 산출물 `12792765413`이 생성되었습니다. 후속 반복 검증기와 무결성 테스트는 현재 26개가 통과했습니다. 이 26개는 검증용 합성 자료를 사용하는 코드 검사도 포함하며, 실제 전투 26회를 뜻하지 않습니다.

고정 틱이 동일 입력에서 완전히 동일한 전체 세이브를 만든다는 것은 **두 차례 이상의 실제 Linux 재생으로 별도 확인해야 합니다**. 이 조치만으로 게임 GUI의 프레임과 물리적 시간이 완전히 같다고 인증하는 것은 아닙니다. 16ms는 헤드리스 실험의 고정 실행 간격이며, 데스크톱의 실제 FPS가 아닙니다.

### 현재 검증 상태 — 완료된 엔진이라고 오인하지 마세요

- 원본 소스와 핵심 전투/AI/RNG 파일의 SHA-256을 고정했습니다.
- RC18 개발 소스 반영본의 **전체 Linux 컴파일에 성공**했습니다. 검증 코드 커밋은 `196ab7d`, 빌드 실행은 `40619712731`입니다.
- `native.test.mjs`의 무결성·입력 어댑터 검사 15개가 통과했습니다. **전투 15회 성공이라는 뜻은 아닙니다.**
- GPT Linux에서 원본 엔진으로 `17.sav` 로드·재저장에 성공했고 초기 전투 상태 전체와 RNG가 입력과 일치했습니다. 원본 세이브는 변경하지 않았습니다.
- 무릎쏴·방향 전환·사격을 원본 명령으로 실행하고 실제 TU·탄약 변화가 저장되는 것을 확인했습니다.
- 수정본에서 같은 입력으로 적 턴을 **두 번 실제 재생하여 각각 아군 2턴으로 복귀**했습니다. RNG·전투 수치·AI·지형 등은 일치했지만, 저장된 애니메이션/피격 연출 프레임 항목 23곳은 달랐습니다. 따라서 엄격한 전체 세이브 비교는 `nativeReplayIdentical: false`를 유지합니다. 이 차이를 숨기거나 삭제하여 성공으로 처리하지 않습니다.
- GUI와 행동별 동등성, 모든 저장 필드의 완전 재현성, 전투 완료 및 대량 전술 탐색은 **아직 인증되지 않았습니다**. 공개 검증 기록은 [native-headless-validation-20261028.md](../../docs/native-headless-validation-20261028.md)를 보세요.
- 소스는 현재 확보한 개발 작업 트리의 스냅샷입니다. `17.sav`를 만든 실행 파일과 정확히 같은 소스/컴파일 설정인지도 아직 인증되지 않았습니다. 상세 값은 `native/source.lock.json`을 확인하세요.

**실제 전투 검증 전에는 무손실 승률이나 성공 전술을 제시하면 안 됩니다.**

## 무엇이 원본 그대로인가

사격·피해·장갑·복셀·이동 비용·반응사격·폭발·적 AI·게임플레이 RNG를 JavaScript/Python으로 다시 계산하지 않습니다. 원본 `TileEngine`, `Pathfinding`, `Projectile`, `BattleUnit`, `AIModule`, `RNG` 등이 그대로 컴파일됩니다.

`native/ReplayDriver.h`는 아군의 명령을 원본 `primaryAction`, `secondaryAction`, `kneel`, `requestEndTurn`에 전달하고, 원본 `SavedGame::save`로 전체 상태를 저장합니다. 상태 머신이 처리 중이거나 낙하·공황 처리가 남아 있으면 다음 명령을 넣지 않습니다. 적 턴은 원본 OXCE가 처리합니다.

`Game::run`의 화면 그리기를 생략하고, 턴 안내창은 원본 `think()` 실행 후 여전히 활성 상태일 때 원본 `NextTurnState::close()`로 확인합니다. 사람이 안내창에서 키를 누르는 경로와 같으며, 생성자·초기화의 환경 효과 및 증원 처리를 건너뛰지 않습니다. 이미 닫힌 안내창을 두 번 닫지 않도록 상태를 검사합니다. **현재는 UI 객체와 기존 리소스 로더 의존성이 남아 있습니다.** 따라서 아직 'MCD/LOFT와 세이브만 있으면 되는 완성된 최소 데이터 엔진'이 아닙니다. 필요한 자산이 없으면 오류로 중단하며, 그림을 가짜로 만들거나 근사 규칙으로 대체하지 않습니다.

## 소스와 빌드

Node.js 18+, CMake, C++17 compiler 및 원본 OXCE의 SDL 1.2/zlib 개발 라이브러리가 필요합니다. Ubuntu 22.04의 CI 예:

```sh
sudo apt-get update
sudo apt-get install -y cmake g++ pkg-config libsdl1.2-dev libsdl-image1.2-dev libsdl-gfx1.2-dev libsdl-mixer1.2-dev zlib1g-dev
node --test tools/headless-simulator/native.test.mjs
node tools/headless-simulator/build-native.mjs /tmp/xpz-native-build 2
```

빌드 산출물: `/tmp/xpz-native-build/bundle/oxce-native`, `native-build.json`, 소스 매니페스트, GPL 라이선스. 실행 바이너리는 현재 동적 링크이므로 실행 환경에도 해당 라이브러리가 필요합니다. CI 산출물은 **빌드 결과일 뿐, 전투 재현 성공 인증이 아닙니다**.

원본 CMake는 링크 후 `bin/TFTD`, `bin/UFO`, `bin/common`, `bin/standard` 폴더를 복사합니다. 소스 전용 빌드 스크립트는 이 단계에 필요한 **빈 폴더만** 준비합니다. 가짜 게임 자산을 생성하지 않으며, 실행 시에는 실제 데이터가 별도로 필요합니다.

원본 전체 소스·라이선스는 압축본 안에 있습니다. 기본 저장소는 MeridianOXC/OpenXcom이며, 사용자 개발 변경도 스냅샷에 보존했습니다. 설치 폴더나 개발 원본을 덮어쓰지 않습니다.

## 네트워크가 막힌 GPT 환경의 소형 실행 파일 반입

직접 빌드하거나 패키지 저장소에 접속할 수 없으면 GitHub Actions의 성공한 **전체 Linux 빌드**에서 `xpz-native-linux-<commit>` 산출물을 사용합니다. PR의 무결성 테스트 성공만으로 빌드 성공을 판단하지 마세요. `Native OXCE offline runtime libraries` 워크플로는 별도로 `xpz-native-sdl-runtime-linux-x64` 산출물을 제공합니다. 둘 다 게임 데이터와 개인 세이브는 포함하지 않습니다.

GitHub 연결의 `download_workflow_artifact`로 두 ZIP을 받아 실제 GPT 작업 공간에 도착했는지 확인한 뒤 압축을 해제하세요. 실행 파일은 `chmod +x /path/to/bundle/oxce-native`가 필요할 수 있습니다. 아래 실행 명령에 `--runtime /path/to/runtime-bundle`을 추가하면 라이브러리별 SHA-256을 전부 검사하고 **해당 자식 프로세스에만** 라이브러리 경로를 적용합니다. 시스템 라이브러리를 덮어쓰지 않습니다. 이 런타임은 Linux x86_64 / glibc 2.35 이상용이며 다른 플랫폼의 호환성은 검증하지 않았습니다.

`native-build.json`의 소스·드라이버 해시가 사용할 `native/source.lock.json`과 일치해야 합니다. 압축파일 반입, 라이브러리 검사, 실행 파일 기동, 실제 전투 체크포인트 생성은 각각 별개의 검증 단계입니다. Actions 산출물은 보존기간이 있으므로 만료 시 동일한 소스에서 다시 빌드해야 합니다.

## 3.sav 게임 데이터 경량 패키지 (음원 제외, 로컬 전용)

원본 OXCE는 게임 규칙을 모두 로드하며 비싼 리소스는 UI/소리 파일에 집중됩니다. 별도 "전투 계산 근사 엔진"이 아니라 **원본 게임 파일을 보존하는 입력 압축본**을 만들 수 있습니다. 현재 활성 모드는 `piratez`와 `ratlingVillageVisibility` **둘 다**이며, 시야/맵 판정에 영향을 줄 수 있으므로 두 모드 모두 반드시 포함해야 합니다.

```sh
node tools/headless-simulator/prepare-runtime-archive.mjs \
  ORIGINAL_DIOXINE_GAME_ROOT ORIGINAL_USER/piratez/3.sav NEW_LOCAL_OUTPUT_DIRECTORY

node tools/headless-simulator/prepare-runtime-archive.mjs \
  --verify NEW_LOCAL_OUTPUT_DIRECTORY
```

음악·효과음·음원 폴더와 원본 백업/다른 세이브 파일을 제외하되, 원본 룰셋·복셀/지형·맵·스프라이트·활성 모드는 보존합니다. `user/options.cfg`는 인증/비밀번호 관련 항목만 삭제한 복사본으로 보존하며 **원본 설정 파일을 바꾸지 않습니다**. `inputs/3.sav`만 포함하고 SHA-256으로 검증합니다. 생성된 아카이브에는 원본 사용자 캠페인 정보가 들어 있으므로 **공개 GitHub 저장소나 Actions 산출물에 게시하면 안 됩니다**. 도구는 외부 업로드를 수행하지 않습니다.

2026-10-28 기준 사용자 PC에서 생성된 로컬 패키지의 검증 기록:

- 파일 크기: **103,957,577바이트 (약 99.1MiB)**, 포함 경로 24,009개
- 아카이브 SHA-256: `0d01f3d29e53726803e42575206a8182e8a96490c2c643d257e8ac0b9b8c2f0e`
- 입력 `3.sav` SHA-256: `28faf3920b016b81ad041b12f63de94548634375b33b2c07fa1fddb184c38a61`
- 이 검증은 **압축 무결성·포함 경로 검증이며 실제 OXCE Linux 기동 및 전투 재생 결과가 아닙니다**.

압축을 개인용 Linux 작업 폴더에 해제한 뒤 `--data`에는 압축 해제 루트, `--user`에는 해당 루트의 `user`, `--save`에는 `inputs/3.sav`, `--config`에는 `config/options.cfg`를 전달합니다. 원본 OXCE의 `Options::mute` 기능을 사용하되, **헤드리스 모드의 `Game::initAudio()` 진입 직후에만** 이 값을 `true`로 설정하고 오디오 초기화를 건너뜁니다. 원본 오디오 초기화 함수의 나머지 부분은 그대로 보존합니다. Linux SDL1.2가 존재하지 않는 오디오 드라이버 이름을 무시하고 다른 장치를 자동 선택한다는 사실을 CI에서 확인했으므로, 환경변수만으로 음소거한다고 가정하는 방식은 **폐기**했습니다. 오디오 패치는 `native-audio-patch.json`, 바이너리 `native-build.json.audioPatchSha256`으로 고정하며 실행기가 영수증을 검증합니다. **원본 `Game::initAudio()` 바깥의 전투·AI·복셀·난수 연산은 수정하지 않았지만, 이 실행 경로와 GUI 사이의 실측 동등성은 여전히 미검증입니다.**

## `3.sav` 전용 첫 턴 실제 네이티브 검증 자동 실행기

아래 명령은 **실제 GPT Linux 작업 환경에 RC17 원본 네이티브 바이너리와 개인용 104MB 리소스 압축본이 도착한 뒤** 실행합니다. 이 툴은 Windows에서 전투를 돌리지 않습니다. 게임 리소스와 `3.sav`는 개인용 출력 폴더에만 풉니다.

```sh
node tools/headless-simulator/run-3sav-native.mjs \
  --archive /private/input/oxce-3sav-resources.tar.gz \
  --binary /private/rc17/oxce-native \
  --manifest /private/rc17/native-build.json \
  --out /private/3sav-native-study --xvfb --smoke-only
```

입력 아카이브 SHA-256·원본 `3.sav` SHA-256·활성 모드 2개를 확인한 뒤, **원본 OXCE `end_turn`을 한 번 실제 처리**하고 체크포인트/손실/오류를 저장합니다. `--smoke-only`는 첫 턴 검증에서 정지합니다. 원본의 게임플레이 RNG를 보존하므로 이 모드가 최초 실행 재현성 판단에 유용합니다.

검증에 성공하면 새 출력 경로로 `--smoke-only`를 제거해 가시 적 2명에 대한 60개 후보를 실제 네이티브 엔진으로 평가합니다. 예시: `--count 10 --start-seed 10000`은 **60개 행동 후보 × 10개 명시적 난수 시드 = 600회** 실험 요청입니다. 결과 파일 `native-search/native-search-report.json`에는 실패도 포함해 기록하며, OXCE에서 `WON` 종료 이벤트가 없으면 **전투 승리로 집계하지 않습니다**. 첫 턴 안전성은 별도 평가입니다.

`run-3sav-native.mjs`의 명령/아카이브 검사 테스트는 실제 게임 시뮬레이션이 아닙니다. 이 프로세스는 게임 리소스 약 100MB를 개인 Linux 환경에 복원하므로 그 환경은 필요한 디스크 용량과 SDL1.2 런타임을 제공해야 합니다. `--runtime` 옵션으로 해시 고정된 별도 SDL 런타임을 지정할 수 있습니다. **아직 바이너리·개인 입력 자료를 같은 GPT Linux 환경으로 반입해 실행한 사례는 없습니다.**

## GPT Linux 환경에서만 실험 실행

`run-native.mjs`는 Windows에서 전투를 실행하지 않도록 차단합니다. 실행 파일의 SHA-256, 입력 파일, 출력 폴더를 검사하고 원본 세이브 복사본을 별도의 사용자/설정 폴더에서 사용합니다.

현재 정확성 인증이 없으므로 개발 실험에는 `--experimental`을 명시해야 합니다. 이 옵션은 근사 계산을 허용하는 옵션이 아닙니다. 오직 원본 C++ 엔진을 실행하되 **아직 GUI 대조검증을 통과하지 않은 빌드임을 인정하는 옵션**입니다.

```sh
node tools/headless-simulator/run-native.mjs \
  --experimental \
  --binary /tmp/xpz-native-build/bundle/oxce-native \
  --manifest /tmp/xpz-native-build/bundle/native-build.json \
  --data /path/to/Dioxine_XPiratez \
  --user /path/to/Dioxine_XPiratez/user \
  --config /path/to/Dioxine_XPiratez/user/options.cfg \
  --save /path/to/17.sav \
  --plan tools/headless-simulator/examples/end-turn.actions \
  --out /mnt/data/xpz-native-run-001
```

기본 화면 드라이버는 SDL dummy입니다. 필요하면 `--xvfb`로 가상 디스플레이를 명시하세요. 실행에 실패하면 **실패 그대로 보고**하며 대체 시뮬레이터를 호출하지 않습니다.

기본값은 저장된 RNG 보존입니다. `--seed 123`은 원본 OXCE의 RNG를 명시적으로 바꾸는 별도 실험입니다. 원본 동일 시드 재생과 다른 시드에 대한 전술 평가를 혼동하지 마세요.

## 현재 명령 프로토콜

```text
observe
end_turn
move UNIT_ID X Y Z
turn UNIT_ID X Y Z
kneel UNIT_ID
fire UNIT_ID ITEM_ID snap X Y Z
fire UNIT_ID ITEM_ID aimed X Y Z
fire UNIT_ID ITEM_ID auto X Y Z
inventory UNIT_ID ITEM_ID right|left|belt|backpack SLOT_X SLOT_Y
prime UNIT_ID ITEM_ID FUSE_TURNS
throw UNIT_ID ITEM_ID X Y Z
stop
```

여기서 `ITEM_ID`는 규칙 이름이 아닌 세이브의 실제 아이템 번호입니다. 사격·투척·신관 조작 시 아이템은 해당 대원의 손에 있어야 합니다. `inventory`는 원본 `TileEngine::itemMoveInventory` 및 장비 슬롯 규칙·인벤토리 이동 TU를 사용하며, 슬롯이 가득 찼거나 허용되지 않는 아이템이면 실패합니다. 손 좌표는 반드시 `0 0`입니다. `prime`은 원본 `BattlescapeGame::handleNonTargetAction`을 호출합니다. `throw`는 원본 R41 투척 2회 클릭 및 3D 탄도 검사 경로를 사용합니다. **실제 행동이 가능한지 여부는 원본 OXCE가 판정하며, 지금은 실행 재현성과 GUI 일치가 검증되지 않았습니다.** 사격은 원본 엔진의 `shotsFiredCounter`가 증가했을 때에만 발사 완료로 인정하고, 투척은 실제 아이템이 대원 소유에서 떨어졌는지 확인합니다. 투사체가 발사되거나 투척됐다는 사실은 명중 또는 승리를 뜻하지 않습니다. 인벤토리 이동 후에는 원본 `InventoryState::close()`의 중력·아이템 조명·시야 재계산도 호출합니다. 이동이 새 적 발견 등으로 중단되면 후속 명령을 무작정 실행하지 않고 오류와 실제 체크포인트를 남깁니다.

**아직 미지원:** 직접 장전, 근접공격/스킬, 인벤토리에서 탄창 끼우기, 아군 병행 행동, 전술 상황별 자동 분기. 인벤토리·신관·투척 명령은 소스 연결과 컴파일 검증 단계이며 `3.sav` 실제 엔진 동작은 별도 검증해야 합니다. 지원하지 않는 명령은 실패합니다.

## 결과 해석

`native-events.jsonl`: 원본 엔진이 기록한 RNG/유닛 상태 및 체크포인트. 실제 종료 시에는 `battle_finished` 이벤트를 추가로 기록합니다.

`user/piratez/xpz-native-*.sav`: 원본 전체 세이브 직렬화 결과. 타일·아이템·AI 등은 이 파일을 기준으로 비교합니다.

`replay-result.json`: 명령열 완료 여부, 실제 `finishBattle()` 종료 상태 및 체크포인트 해시. `planCompleted`는 **전투 승리와 다릅니다**. `parityCertified`와 `battleVictoryCertified`는 현재 항상 `false`입니다.

같은 입력·소스·행동·RNG의 두 실제 실행을 비교합니다. 비교기는 원본 소스뿐 아니라 패치 포함 압축본·바이너리·행동열·설정·입력 세이브 해시까지 같아야 진행하며, 필수 해시가 없는 구형 결과는 거부합니다:

```sh
node tools/headless-simulator/compare-replays.mjs \
  /mnt/data/run-a/replay-result.json /mnt/data/run-b/replay-result.json
```

이 비교의 통과는 두 native 실행의 일치만 뜻합니다. GUI와의 동등성이나 모든 게임 상황의 정확성을 증명하지 않습니다.

## 반복 재현성 검사: 한 명령으로 실행 및 전체 저장 파일 비교

`verify-native-replays.mjs`는 `run-native.mjs`와 같은 옵션에 `--repetitions 3`을 추가하여 사용합니다. 매번 **별도 원본 OXCE 프로세스**를 실행하고, 원본 세이브를 덮어쓰지 않습니다. 결과 JSON의 주장만 비교하는 것이 아니라, 각 실행의 실제 `native-events.jsonl` 및 모든 `.sav` 체크포인트 바이트를 다시 읽어 검사합니다.

```sh
node tools/headless-simulator/verify-native-replays.mjs \
  --repetitions 3 --experimental \
  --binary /path/to/bundle/oxce-native \
  --manifest /path/to/bundle/native-build.json \
  --runtime /path/to/runtime-bundle \
  --data /path/to/Dioxine_XPiratez \
  --user /path/to/Dioxine_XPiratez/user \
  --config /path/to/Dioxine_XPiratez/user/options.cfg \
  --save /path/to/17.sav \
  --plan tools/headless-simulator/examples/end-turn.actions \
  --out /mnt/data/xpz-native-verification-001
```

출력 루트의 `verification.json`에는 요청/완료 실행 수, 각 실행의 턴·RNG·체크포인트, 불일치 내역이 남습니다. 실패하면 `status: failed` 또는 `mismatch`를 기록합니다. 모든 요청 실행과 전체 저장 바이트 비교가 완료되기 전에는 `passed`를 기록하지 않습니다. 게임 자료도 실제 파일 내용의 SHA-256으로 검사하며 중간에 바뀌면 실패합니다. 대용량 파일을 다시 다운로드하는 작업이 아니라 이미 있는 자료를 읽는 작업입니다.

이 명령은 **같은 RNG로 2~20회 재현성을 검증하는 용도**입니다. 서로 다른 RNG의 전술 5,000회 탐색, GUI 동등성 인증, 전투 승리 인증과는 다릅니다. `battleVictoryCertified`와 `interactiveParityCertified`는 `false`를 유지합니다. 사용한 SDL 런타임과 화면 드라이버도 달라지면 직접 비교를 거부합니다.

새 빌드 산출물에는 `runner/` 아래에 해당 바이너리와 짝을 이루는 실행기·비교기·검증기를 함께 포함합니다. 산출물이 존재하는 것과 GPT 환경에서 실제 실행된 것은 별개입니다. 실행 도구 오류나 누락 자료를 근사 엔진으로 우회하지 않습니다. **기존 리소스 로더가 필요한 게임 자산은 여전히 필요하며, 본체 자산 제거는 아직 완료되지 않았습니다.**

## 원본 OXCE 대량 전술 실험 (계획 파일 × RNG 시드)

원본 C++ 엔진을 매번 새 프로세스로 시작하여 **별도의 계획 파일과 난수 시드 조합**을 실행하는 `search-native.mjs`를 제공합니다. Node.js가 사격, 피해량 또는 AI 판단을 계산하지 않습니다. 각 실험은 `run-native.mjs`를 통해 OXCE 실행 파일을 기동합니다.

```sh
node tools/headless-simulator/search-native.mjs \
  --experimental \
  --binary /tmp/xpz-native-build/bundle/oxce-native \
  --manifest /tmp/xpz-native-build/bundle/native-build.json \
  --runtime /path/to/runtime-bundle \
  --data /path/to/Dioxine_XPiratez \
  --user /path/to/Dioxine_XPiratez/user \
  --config /path/to/Dioxine_XPiratez/user/options.cfg \
  --save /path/to/17.sav \
  --plans /path/to/action-plans \
  --start-seed 10000 --count 1000 \
  --out /mnt/data/xpz-native-search-001
```

`--plans` 폴더에는 하나 이상의 `.actions` 파일이 필요합니다. 각 파일에는 위 명령 프로토콜의 실제 OXCE 행동만 씁니다. 한 계획 파일당 `--count`개의 **서로 다른 명시적 시드**를 실행합니다. `--count`를 생략하면 각 계획을 원본 세이브에 저장된 RNG로 한 번 실행합니다. 독립 시드 1,000개를 통한 강건성 평가와 현재 저장 RNG의 정확한 예측은 목적이 다르므로 반드시 구별해야 합니다. 전체 실행 횟수 제한은 10,000회이며 파일·게임 자료·바이너리를 교체하면 실패합니다.

`native-search-report.json`은 각 시도별 실제 종료 상태와 원본 최종 세이브 기반 아군 사망·기절·순 체력 감소를 기록합니다. **`WON` 종료 이벤트가 발생하지 않으면 승리 횟수에 포함되지 않습니다.**

**첫 턴 후보 비교(임무 미완료):** 아군 1턴을 끝내고 원본 OXCE 적 턴을 거쳐 아군 다음 턴으로 실제 복귀한 실험이라면, 최종 `checkpoint.units`의 아군 원래 ID·체력·기절·상태·정신지배 여부를 그대로 읽어 `firstTurnSafety`를 기록합니다. 비교 순서는 사망 → 의식불명 → 제어권 상실 → 순 HP 감소 → 추가 기절입니다. 결과는 `NONTERMINAL_NATIVE_CHECKPOINT_ONLY`로 표시하며 `bestFirstTurnTrial`과 **실제 임무 승리**인 `bestTrial`은 구분합니다. 적 턴을 완료하지 못하거나 `phase: final` 체크포인트가 없으면 첫 턴 성적도 생성하지 않습니다. `NEXT_STAGE`는 중간 단계이지 승리가 아니며, 지원하지 않는 행동이나 미완료 실행도 승리로 처리하지 않습니다. 우수 전술은 **원래 아군 사망 최소화 → 의식불명 최소화 → 정신지배 등으로 제어권을 잃은 대원 최소화 → 순 체력 감소 최소화 → 추가 기절 수치 최소화** 순서로 선택합니다. 원본 OXCE는 `originalFaction`이 현재 `faction`과 다를 때에만 세이브에 별도로 기록하므로, 파서는 그 필드를 복원하여 정신지배된 원래 아군이 분모에서 빠지지 않도록 합니다.

`zeroDeathNativeWin`은 사망만 0이라는 뜻이며 기절 또는 정신지배가 남아 있을 수 있습니다. `zeroConsciousNativeWin`은 사망·의식불명·제어권 상실이 모두 0이고, `zeroHpLossNativeWin`은 사망과 **순 체력 감소**가 0이라는 뜻입니다. `zeroNetHpAndStunLossNativeWin`은 그 조건과 새로운 기절 증가량 0까지 요구합니다. **치유나 장갑 회복 때문에 이들 값이 0이라도 전투 중 한 번도 피격되지 않았다는 증거는 아닙니다.** 순 체력 감소는 최종 HP 차이이며 누적 피해 총량을 의미하지 않습니다.

### 임의 전투 `.sav`에서 첫 사격 후보 계획 자동 생성

`generate-native-plans.mjs`는 실제 `.sav`의 아군/적군 ID·좌표·적의 현재 `visible: true`·손에 든 무기 **아이템 ID**만 읽고 첫 사격 후보를 열거합니다. 명중·피해·사선·TU를 계산하지 않으며, 유효하지 않은 사격은 이후 원본 OXCE가 거절합니다. 원본 세이브와 게임 설치 폴더는 수정하지 않습니다.

```sh
node tools/headless-simulator/generate-native-plans.mjs \
  /path/to/17.sav /tmp/xpz-first-shot-plans --modes snap,aimed,auto --max-plans 600
```

원본 OXCE 소스 압축본은 그대로 보존합니다. 네이티브 입력 명령의 변경은 `native/ReplayDriver.h`만 별도의 `source.lock.json.driverOverrideSha256`으로 고정하고, 빌드 시 `native-driver-override.json`에 원본/교체 해시를 함께 기록합니다. 게임플레이 코드는 이 방법으로 수정하지 않으며, 실행기는 교체 영수증이 누락되거나 변조되면 시작을 거부합니다.

`3.sav`용으로는 읽기 전용 추출을 통해 **손에 든 총기 10정 × 현재 가시 적 2명 × 사격 모드 3개 = 60개 후보 행동 파일**을 작성할 수 있음을 확인했습니다. 해당 후보는 원본 C++ 엔진에서 전투로 실행되지 않았습니다. 예시 `examples/3sav-ssrl-chryssalid-UNVERIFIED.actions`는 아군 19의 백팩 로켓(아이템 174)을 왼손으로 옮기고 오른손 기관단총(113)을 빈 백팩 자리로 옮긴 뒤 가시 크리살리드 1000025를 조준합니다. 이 파일은 **TU·사선·유효 사격과 생존 여부 모두 미검증**이며, 실행 후 성공 기록이 없으면 해법으로 취급하면 안 됩니다. `examples/3sav-smg-navigator-UNVERIFIED.actions`도 마찬가지로 미검증 후보입니다.

해당 `17.sav`를 읽기 전용 검사한 결과, 원래 아군 11명·가시 적 3명·손에 든 아이템 13개 조합에서 **117개 초기 사격 후보 파일**이 생성될 수 있음을 확인했습니다.

범위를 좁히려면 실제 세이브에서 확인한 ID만 `--actors`, `--items`, `--targets`로 지정하세요. 쉼표 구분이며, 누락·중복·현재 가시 적이 아닌 목표는 **오류로 거절**합니다. 예를 들어 `--items 113,168 --targets 1000017,1000025`는 해당 아이템 두 개와 해당 적 두 명의 조합만 준비합니다. 다만 이 ID들이 **지정 세이브에 실제 존재한다는 전제**가 있으며, 첫 사격의 유효성·성공 여부는 원본 OXCE가 검증합니다. `--actors`도 사용할 수 있으며, 장비와 소유자 ID가 불일치하면 오류로 중단합니다. 이 수치는 후보 열거 개수이며 실제 공격 성공이나 전술 승리 횟수가 아닙니다. 숨은 적의 세이브 좌표는 첫 사격 자동 계획에 넣지 않습니다. `--no-end-turn`을 지정하면 적 턴을 자동 종료하는 명령을 제외할 수 있습니다.

생성된 `.actions` 계획을 위 `search-native.mjs --plans /tmp/xpz-first-shot-plans`에 연결하면 **각 후보를 원본 엔진이 실제로 실행하여** 오류·피해·임무 결과를 평가합니다. 한 번 사격한 뒤 적 턴을 종료하는 1단계 계획이므로, 이 후보만으로 전투 전체 승리 전략을 자동 완성하는 것은 아닙니다. 실제 승패 기록이 없는 계획은 승리로 세지 않습니다.

현재 다단계 전술의 자동 분기·계획 수정은 미구현입니다. 제공된 행동 계획을 원본 엔진에서 시험하는 **배치 실행기**이며, 후보 생성기는 첫 행동 공간을 한정하는 보조 도구입니다. 5,000회라는 숫자는 위 명령을 실제 실행하고 로그를 검증하기 전에는 단지 설정값일 뿐이며, GUI 동등성 검증이 완료된 네이티브 승리 인증도 아닙니다. 실행 시간과 디스크 사용량은 계획 수·게임 데이터·맵에 따라 상당할 수 있습니다.

## 다음 대화 지시문

> road2man-cloud/xpiratez-data-atlas의 최신 tools/headless-simulator/README.md와 native/source.lock.json을 먼저 읽으세요. 폐기된 simulate.mjs 및 독립 근사 모델은 사용하지 마세요. 원본 OXCE 소스·바이너리 해시를 확인하고 GPT Linux 환경에서 native 실험을 수행하세요. Windows는 원본 자료 읽기/빌드에만 사용하고 전투는 실행하지 마세요. 실제 네이티브 실행이 불가능하면 실패를 보고하세요. 단위 테스트, 컴파일 성공, 명령열 완료, GUI 일치, 실제 전투 승리를 서로 구분하세요. 미완성 상태에서 수천 회 승률을 생성하지 마세요.
