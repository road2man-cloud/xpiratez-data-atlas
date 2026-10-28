# X-Piratez / OXCE native headless replay

## 기존 근사 시뮬레이터는 폐기되었습니다

`simulate.mjs`와 기존 `test.mjs`는 삭제되었습니다. 예전의 `--runs 5000` 명령, 자체 명중/피해 수식, 단순 AI, 근사 승률은 더 이상 실행하거나 사용하지 않습니다. Git 이력의 옛 버전을 복구하여 전술 근거로 사용하지 마세요. 현재 디렉터리에 근사 엔진으로 돌아가는 대체 실행 경로는 없습니다.

이 디렉터리는 **원본 OXCE C++ 엔진 전체 소스 + 헤드리스 입력/출력 어댑터**입니다. `native/oxce-source.tar.gz`에는 실제 개발 소스 스냅샷 963개 파일과 어댑터가 들어 있습니다. 게임 본체나 개인 세이브는 포함하지 않습니다. 소스 압축본은 2,857,359바이트(약 2.7MiB)입니다.

기본 빌드 구조·라이브러리는 OXCE 8.7.1 작업 트리에서 가져오고, 실제 프로젝트 개발 기준인 `XPZ_R42_ROTATION_LAB/RC18_CAMERA_SCROLL_FIX_SOURCE/src`의 832개 파일을 우선 적용했습니다. 이전 작업 트리로 되돌아가지 않도록 결합된 소스의 해시를 고정했습니다. 어느 소스에서 무엇을 가져왔는지는 매니페스트의 `sourceOverlayApplied`, `overlayFiles`와 `source.lock.json`으로 확인할 수 있습니다.

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
node --test tools/headless-simulator/native.test.mjs tools/headless-simulator/native.clock.test.mjs
node tools/headless-simulator/build-native.mjs /tmp/xpz-native-build 2
```

빌드 산출물: `/tmp/xpz-native-build/bundle/oxce-native`, `native-build.json`, 소스 매니페스트, GPL 라이선스. 실행 바이너리는 현재 동적 링크이므로 실행 환경에도 해당 라이브러리가 필요합니다. CI 산출물은 **빌드 결과일 뿐, 전투 재현 성공 인증이 아닙니다**.

원본 CMake는 링크 후 `bin/TFTD`, `bin/UFO`, `bin/common`, `bin/standard` 폴더를 복사합니다. 소스 전용 빌드 스크립트는 이 단계에 필요한 **빈 폴더만** 준비합니다. 가짜 게임 자산을 생성하지 않으며, 실행 시에는 실제 데이터가 별도로 필요합니다.

원본 전체 소스·라이선스는 압축본 안에 있습니다. 기본 저장소는 MeridianOXC/OpenXcom이며, 사용자 개발 변경도 스냅샷에 보존했습니다. 설치 폴더나 개발 원본을 덮어쓰지 않습니다.

원본 소스 압축본은 변경하지 않습니다. 현재 빌드는 검증한 압축본을 임시 디렉터리에 푼 뒤 `clock-patch.mjs`와 `native/ReplayClock.h`를 별도로 적용합니다. 이 추가 계층은 `native/clock.lock.json`의 패처·헤더·원본 소스 해시로 고정됩니다. 원본 전투/AI/RNG 파일은 수정하지 않습니다. Windows 체크아웃에서도 지문이 달라지지 않도록 관련 파일의 줄바꿈을 `.gitattributes`로 LF에 고정합니다.

## 네트워크가 막힌 GPT 환경의 소형 실행 파일 반입

직접 빌드하거나 패키지 저장소에 접속할 수 없으면 GitHub Actions의 성공한 **전체 Linux 빌드**에서 `xpz-native-linux-<commit>` 산출물을 사용합니다. PR의 무결성 테스트 성공만으로 빌드 성공을 판단하지 마세요. `Native OXCE offline runtime libraries` 워크플로는 별도로 `xpz-native-sdl-runtime-linux-x64` 산출물을 제공합니다. 둘 다 게임 데이터와 개인 세이브는 포함하지 않습니다.

무결성 검사 워크플로는 `xpz-native-source-kit-<commit>`도 제공합니다. 원본 소스 압축본·실행기·검사 코드만 담으며 게임 자산과 개인 세이브는 없습니다. 새 GPT 대화에서 저장소 전체 대신 이 소형 키트를 가져와 Linux의 실제 C++ 타이머 검사까지 재실행할 수 있습니다. **이 키트가 기존 게임 자산 로더 의존성까지 제거한 것은 아닙니다.**

GitHub 연결의 `download_workflow_artifact`로 실행 파일과 런타임 ZIP을 받아 실제 GPT 작업 공간에 도착했는지 확인한 뒤 압축을 해제하세요. 실행 파일은 `chmod +x /path/to/bundle/oxce-native`가 필요할 수 있습니다. 아래 실행 명령에 `--runtime /path/to/runtime-bundle`을 추가하면 라이브러리별 SHA-256을 전부 검사하고 **해당 자식 프로세스에만** 라이브러리 경로를 적용합니다. 시스템 라이브러리를 덮어쓰지 않습니다. 이 런타임은 Linux x86_64 / glibc 2.35 이상용이며 다른 플랫폼의 호환성은 검증하지 않았습니다.

`native-build.json`의 소스·드라이버 해시가 사용할 `native/source.lock.json`과 일치해야 합니다. 압축파일 반입, 라이브러리 검사, 실행 파일 기동, 실제 전투 체크포인트 생성은 각각 별개의 검증 단계입니다. Actions 산출물은 보존기간이 있으므로 만료 시 동일한 소스에서 다시 빌드해야 합니다.

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

## 선택적 고정 시간 실험 — 기본값은 기존 실행 방식

새 빌드에서 위 실행 명령에 `--fixed-clock`을 추가하면 `fixed-1ms-v1` 정책을 사용합니다. 원본 `Timer.cpp`의 시간 읽기 두 곳에만 고정 시간 값을 공급하고, 헤드리스 메인 루프마다 1ms씩 진행합니다. 원본 타이머의 간격·프레임 건너뛰기·콜백 순서·전투 계산식은 다시 구현하지 않습니다. 옵션이 없거나 일반 GUI 실행이면 기존 시간 값을 그대로 사용합니다. 이전 실행의 환경변수만으로 이 옵션이 몰래 켜지지 않도록 실행기에서 초기화합니다.

목적은 실제 경과시간에 따라 저장된 프레임 값이 달랐던 원인을 분리하는 것입니다. **시간 진행 방식을 바꾼 실험이므로 결정적 실행이 곧 GUI 동등성을 뜻하지 않습니다.** 이 수정본의 `17.sav` 전체 필드 재현성 및 GUI 대조는 아직 인증하지 않았습니다. 검사 통과를 해당 인증으로 바꾸지 마세요.

`native.clock.test.mjs`는 실제 소스 압축본의 C++ `Timer.cpp`를 컴파일하여 서로 다른 시간 입력에서도 콜백 순서와 횟수가 일치하는지 검사합니다. 주변 SDL/UI 선언만 검사 장치로 대체하며, 이는 **타이머 단위 검사이지 전투 재생이 아닙니다**. 이 C++ 검사는 Linux CI/GPT에서 실행하며 Windows에서는 명시적으로 건너뜁니다.

실행 기록에는 `clockPolicy`와 `clockAdapterSha256`이 남습니다. 비교기는 서로 다른 시간 정책·추가 패치 해시를 섞으면 거부합니다. 저장된 `animFrame`·피격 프레임 항목을 삭제하거나 덮어써 일치한 것처럼 만들지 않으며, 전체 체크포인트 해시 비교를 유지합니다.

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
stop
```

여기서 `ITEM_ID`는 규칙 이름이 아닌 세이브의 실제 무기 아이템 번호입니다. 무기는 해당 대원의 손에 있어야 합니다. 이동이 새 적 발견 등으로 중단되면 후속 명령을 무작정 실행하지 않고 오류와 실제 체크포인트를 남깁니다.

투척, 장전, 인벤토리 조작, 스킬, 조건 분기, 자동 승리 판정 및 전술 탐색기는 이 입력 어댑터에 아직 연결하지 않았습니다. 원본 엔진에 기능이 존재하는 것과 이 어댑터로 자동 제어할 수 있는 것은 다릅니다. 지원하지 않는 명령은 실패합니다.

## 결과 해석

`native-events.jsonl`: 원본 엔진이 기록한 RNG/유닛 상태 및 체크포인트.

`user/piratez/xpz-native-*.sav`: 원본 전체 세이브 직렬화 결과. 타일·아이템·AI 등은 이 파일을 기준으로 비교합니다.

`replay-result.json`: 명령열 완료 여부와 체크포인트 해시. `planCompleted`는 **전투 승리와 다릅니다**. `parityCertified`와 `battleVictoryCertified`는 현재 항상 `false`입니다.

같은 입력·소스·행동·RNG의 두 실제 실행을 비교합니다. 비교기는 원본 소스뿐 아니라 패치 포함 압축본·바이너리·행동열·설정·입력 세이브 해시까지 같아야 진행하며, 필수 해시가 없는 구형 결과는 거부합니다:

```sh
node tools/headless-simulator/compare-replays.mjs \
  /mnt/data/run-a/replay-result.json /mnt/data/run-b/replay-result.json
```

이 비교의 통과는 두 native 실행의 일치만 뜻합니다. GUI와의 동등성이나 모든 게임 상황의 정확성을 증명하지 않습니다.

## 다음 대화 지시문

> road2man-cloud/xpiratez-data-atlas의 최신 tools/headless-simulator/README.md와 native/source.lock.json을 먼저 읽으세요. 폐기된 simulate.mjs 및 독립 근사 모델은 사용하지 마세요. 원본 OXCE 소스·바이너리 해시를 확인하고 GPT Linux 환경에서 native 실험을 수행하세요. Windows는 원본 자료 읽기/빌드에만 사용하고 전투는 실행하지 마세요. 실제 네이티브 실행이 불가능하면 실패를 보고하세요. 단위 테스트, 컴파일 성공, 명령열 완료, GUI 일치, 실제 전투 승리를 서로 구분하세요. 미완성 상태에서 수천 회 승률을 생성하지 마세요.
