# ChatGPT 대화에서 원본 OXCE 전투를 반복 재현하기 위한 어댑터

## 정확성 기준

수치가 비슷한 독립 계산기를 제작하는 것이 아니라, **원본 C++ 전투 로직과 실행 순서를 보존**한다. Python/JavaScript/네이티브 코드 중 무엇을 사용하든 원본과 불일치한 계산은 전투 결과로 사용하지 않는다.

이 저장소의 **chat-batch.mjs**는 전술을 JSON으로 받아 원본 OXCE 행동 명령으로 변환하고, 원본 바이너리에서 여러 번 재생한 체크포인트를 검증한다. JavaScript에서 명중률·탄도·장갑·RNG·반응사격·적 AI를 재계산하지 않는다. 즉, 원본 C++ 엔진을 재사용함으로써 별도 수식 포팅 과정에서 규칙을 잃어버릴 위험을 줄인다.

**전투 모델을 전부 Python으로 포팅했다는 뜻은 아니다.** 원본 C++ 엔진 자체를 호출하는 방식이고, 현 헤드리스 어댑터는 아직 모든 게임 행동을 제어하지 못한다. fire/move/turn/kneel/end_turn/observe/stop 이외의 전투 조작은 거부한다. 원본 소스 963개 파일을 보존했다는 사실과 전체 전투 행동 및 GUI와의 동등성이 인증되었다는 것은 다르다.

## GPT 대화 작업 절차

1. GitHub 최신 커밋과 native/source.lock.json, native/clock.lock.json, 바이너리 매니페스트를 확인한다. **소스 파일이 GPT의 영구 기억에 저장되었다고 가정하지 않는다.** 원본 불변성은 파일과 해시로 보장한다.
2. 사용자가 허용한 연결 파일 접근 경로에서 세이브와 게임 자료를 읽는다. 별도 작업 환경에 매번 **수동 업로드**할 필요가 없는 경로를 우선한다. 단, 격리된 실행 환경을 사용한다면 파일을 실제로 이동할 권한과 방법은 여전히 필요하다.
3. 실제 세이브의 아군 ID, 무기 **인스턴스 ID**, 좌표를 확인한다. 룰셋 이름이나 추측 좌표를 실제 명령에 끼워 넣지 않는다.
4. examples/chat-native-request.example.json을 참고해 전술 계획을 GPT가 요청 JSON으로 만든다. 사용자가 직접 JSON을 작성할 필요는 없다.
5. 저장 RNG로 1회 재현을 먼저 점검하고, 이후 별도 시드로 1,000회 이상 반복할 수 있다. 계획 A와 B는 같은 시드 목록으로 비교한다.
6. chat-batch-report.json과 원본 체크포인트 sav, native-events.jsonl, 각 시행의 provenance.json을 대조한다.
7. 대화에서 실제 완료 횟수, 실패 횟수, 진행되지 않은 횟수를 구분한다. 승리나 확률을 만들어 내지 않는다.

### 호출

~~~sh
node tools/headless-simulator/chat-batch.mjs /absolute/path/to/chat-request.json
~~~

입력 JSON에는 native.binary, manifest, data, user, config, save, output을 모두 **실제로 접근 가능한 절대 경로**로 지정한다. runtime, master, timeoutSeconds, fixedClock, xvfb는 선택이다. 미인증 실험적 네이티브 빌드를 사용하는 한계를 명시적으로 수락하려면 native.experimentalAcknowledged가 true여야 한다.

plans는 전술별 id와 actions 배열이다. actions는 임의 코드가 아니라 원본 드라이버의 명령을 나타내는 JSON이다. unitId, itemId, target, mode를 명령에 따라 지정한다. 예시 ID는 실제 세이브 값이 아니다.

sampling.runsPerPlan은 계획당 1~10,000이며 전체 시행은 최대 10,000이다. 2회 이상일 때 firstSeed 문자열이 필수다. 각 계획은 같은 명시적 시드 목록을 사용하되 원본 세이브에서 다시 시작한다. firstSeed 생략 + 1회는 저장된 RNG를 보존한다.

### 출력의 의미

- **완료:** 원본 네이티브 프로세스에서 명령열이 종료되고 전체 세이브 체크포인트가 검증되었다는 뜻.
- **아군/적 체력 변화:** 엔진이 저장한 유닛 상태의 실제 비교값. 중간 회복이 있었다면 누적 피해량과 다르다.
- **승리:** 현 어댑터는 원본 finishBattle 승패 이벤트를 직접 관측하지 않는다. HP가 0 이하인 유닛이 있어도 곧바로 승리/사망을 확정하지 않는다. nativeWins에는 UNOBSERVABLE_IN_THIS_ADAPTER를 기록한다.
- **반복:** 실제 시행 중 원본 실행과 검증이 끝난 횟수만 완료로 집계한다.
- **정확성:** 원본 엔진 C++ 함수를 사용하지만 개발용 드라이버·타이밍·GUI 통합 차이 때문에 실제 GUI와의 완전 동등성은 **미인증**이다.

## 정확성 확인을 위해 남은 작업

- 투척, 장전, 장비 사용, 개별 능력 등 연결되지 않은 사용자 행동에 원본 엔진 API를 연결
- 원본 UI 조작과 네이티브 입력을 행동별 전체 저장 필드, RNG 및 이벤트 순서로 교차 검증
- 부작용 없는 원본 finishBattle 승패 관측 및 다단계 미션 이어하기
- 대규모 반복 실행의 성능, 실패율, 파일·리소스 무결성을 실제 세이브로 검증
- 새 GPT 대화에서 연결된 자료를 자동 발견하는 편의 계층: 사용자의 연결 권한 및 도구 사용 가능 상태에 의존

실패/미지원 상태를 근사 계산으로 메우지 않는다. **원본의 모든 연산을 보존하기 위해 원본을 재사용하는 것은 현재 가장 충실한 경로**이지만, 전체 시뮬레이터 완성 선언은 검증 이후에만 가능하다.

## 시험

~~~sh
node --test tools/headless-simulator/chat-batch.test.mjs tools/headless-simulator/native.test.mjs
~~~

단위 테스트 통과는 실제 전투 완료/수천 회 시뮬레이션을 의미하지 않는다.
