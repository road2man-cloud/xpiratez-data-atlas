# X-Piratez / OXCE native headless replay

## 기존 근사 시뮬레이터는 폐기되었습니다

`simulate.mjs`와 기존 `test.mjs`는 삭제되었습니다. 예전의 `--runs 5000` 명령, 자체 명중/피해 수식, 단순 AI, 근사 승률은 더 이상 실행하거나 사용하지 않습니다. Git 이력의 옛 버전을 복구하여 전술 근거로 사용하지 마세요. 현재 디렉터리에 근사 엔진으로 돌아가는 대체 실행 경로는 없습니다.

이 디렉터리는 **원본 OXCE C++ 엔진 전체 소스 + 헤드리스 입력/출력 어댑터**입니다. `native/oxce-source.tar.gz`에는 실제 개발 소스 스냅샷 954개 파일과 어댑터가 들어 있습니다. 게임 본체나 개인 세이브는 포함하지 않습니다. 소스 압축본은 약 2.3MiB입니다.

### 현재 검증 상태 — 완료된 엔진이라고 오인하지 마세요

- 원본 소스와 핵심 전투/AI/RNG 파일의 SHA-256을 고정했습니다.
- 실제 `BattlescapeGame.cpp`와 `Game.cpp`의 어댑터 통합 컴파일을 확인했습니다.
- `native.test.mjs`는 파일 무결성·근사 실행 경로 제거·잘못된 입력 차단 테스트입니다. **전투 성공 테스트가 아닙니다.**
- Linux 전체 빌드는 GitHub Actions의 별도 작업으로 검증합니다. 해당 작업의 실제 결과를 확인해야 합니다.
- `17.sav` 로딩, 적 턴 재생, GUI와 행동별 결과 일치, 전투 완료, 대량 전술 탐색은 **아직 인증되지 않았습니다**.
- 소스는 현재 확보한 개발 작업 트리의 스냅샷입니다. `17.sav`를 만든 실행 파일과 정확히 같은 소스/컴파일 설정인지도 아직 인증되지 않았습니다. 상세 값은 `native/source.lock.json`을 확인하세요.

**실제 전투 검증 전에는 무손실 승률이나 성공 전술을 제시하면 안 됩니다.**

## 무엇이 원본 그대로인가

사격·피해·장갑·복셀·이동 비용·반응사격·폭발·적 AI·게임플레이 RNG를 JavaScript/Python으로 다시 계산하지 않습니다. 원본 `TileEngine`, `Pathfinding`, `Projectile`, `BattleUnit`, `AIModule`, `RNG` 등이 그대로 컴파일됩니다.

`native/ReplayDriver.h`는 아군의 명령을 원본 `primaryAction`, `secondaryAction`, `kneel`, `requestEndTurn`에 전달하고, 원본 `SavedGame::save`로 전체 상태를 저장합니다. 상태 머신이 처리 중이거나 낙하·공황 처리가 남아 있으면 다음 명령을 넣지 않습니다. 적 턴은 원본 OXCE가 처리합니다.

`Game::run`의 화면 그리기만 생략합니다. **현재는 UI 객체와 기존 리소스 로더 의존성이 남아 있습니다.** 따라서 아직 'MCD/LOFT와 세이브만 있으면 되는 완성된 최소 데이터 엔진'이 아닙니다. 필요한 자산이 없으면 오류로 중단하며, 그림을 가짜로 만들거나 근사 규칙으로 대체하지 않습니다.

## 소스와 빌드

Node.js 18+, CMake, C++17 compiler 및 원본 OXCE의 SDL 1.2/zlib 개발 라이브러리가 필요합니다. Ubuntu 22.04의 CI 예:

```sh
sudo apt-get update
sudo apt-get install -y cmake g++ pkg-config libsdl1.2-dev libsdl-image1.2-dev libsdl-gfx1.2-dev libsdl-mixer1.2-dev zlib1g-dev
node --test tools/headless-simulator/native.test.mjs
node tools/headless-simulator/build-native.mjs /tmp/xpz-native-build 2
```

빌드 산출물: `/tmp/xpz-native-build/bundle/oxce-native`, `native-build.json`, 소스 매니페스트, GPL 라이선스. 실행 바이너리는 현재 동적 링크이므로 실행 환경에도 해당 라이브러리가 필요합니다. CI 산출물은 **빌드 결과일 뿐, 전투 재현 성공 인증이 아닙니다**.

원본 전체 소스·라이선스는 압축본 안에 있습니다. 기본 저장소는 MeridianOXC/OpenXcom이며, 사용자 개발 변경도 스냅샷에 보존했습니다. 설치 폴더나 개발 원본을 덮어쓰지 않습니다.

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
stop
```

여기서 `ITEM_ID`는 규칙 이름이 아닌 세이브의 실제 무기 아이템 번호입니다. 무기는 해당 대원의 손에 있어야 합니다. 이동이 새 적 발견 등으로 중단되면 후속 명령을 무작정 실행하지 않고 오류와 실제 체크포인트를 남깁니다.

투척, 장전, 인벤토리 조작, 스킬, 조건 분기, 자동 승리 판정 및 전술 탐색기는 이 입력 어댑터에 아직 연결하지 않았습니다. 원본 엔진에 기능이 존재하는 것과 이 어댑터로 자동 제어할 수 있는 것은 다릅니다. 지원하지 않는 명령은 실패합니다.

## 결과 해석

`native-events.jsonl`: 원본 엔진이 기록한 RNG/유닛 상태 및 체크포인트.

`user/piratez/xpz-native-*.sav`: 원본 전체 세이브 직렬화 결과. 타일·아이템·AI 등은 이 파일을 기준으로 비교합니다.

`replay-result.json`: 명령열 완료 여부와 체크포인트 해시. `planCompleted`는 **전투 승리와 다릅니다**. `parityCertified`와 `battleVictoryCertified`는 현재 항상 `false`입니다.

같은 입력·소스·행동·RNG의 두 실제 실행을 비교:

```sh
node tools/headless-simulator/compare-replays.mjs \
  /mnt/data/run-a/replay-result.json /mnt/data/run-b/replay-result.json
```

이 비교의 통과는 두 native 실행의 일치만 뜻합니다. GUI와의 동등성이나 모든 게임 상황의 정확성을 증명하지 않습니다.

## 다음 대화 지시문

> road2man-cloud/xpiratez-data-atlas의 최신 tools/headless-simulator/README.md와 native/source.lock.json을 먼저 읽으세요. 폐기된 simulate.mjs 및 독립 근사 모델은 사용하지 마세요. 원본 OXCE 소스·바이너리 해시를 확인하고 GPT Linux 환경에서 native 실험을 수행하세요. Windows는 원본 자료 읽기/빌드에만 사용하고 전투는 실행하지 마세요. 실제 네이티브 실행이 불가능하면 실패를 보고하세요. 단위 테스트, 컴파일 성공, 명령열 완료, GUI 일치, 실제 전투 승리를 서로 구분하세요. 미완성 상태에서 수천 회 승률을 생성하지 마세요.
