# R36LN — 2026-11-28 사용자 중심부 레퍼런스 기반 연속 곡면 개선

## 이번에 실제 추가한 소스
- `source/center_contour.cjs`: 기존 R36KZ 통합 전신 메시에서 전면 중심부를 직접 변형하는 재사용 가능한 **Node.js 조형 모듈**
- 입력은 R36KZ 생산기의 `sculptChest` 결과 구조(positions, normals, joints, weights, indices)이며, **골격·UV·재질·트라이앵글 개수는 그대로 유지**
- 중심부 좌우 곡면·비대칭적인 높낮이·안쪽의 얕은 중심 함몰을 연속 높이장으로 구성
- 좌표가 같은 UV 분할 정점들을 하나의 그룹으로 이동하여 UV 경계 틈을 억제
- 삼각형 뒤집힘 방지를 위해 영역 내 인접면의 면적 비율과 법선 방향을 검사하고 필요 시 이동량을 자동 축소
- 동일 위치의 렌더 정점 법선을 다시 합쳐 피부 표면의 삼각형별 명암 단절을 감소시키는 방향으로 설계

## 기존 R36KZ 빌드 체인에서 적용
기존 `r36kz-chest-center-shape-20261128/source/build_floor.cjs`는 편집하지 않는다.
이 모듈을 신규 생산기에서 불러와 다음 순서로 사용할 수 있다.

```js
const {sculpt: sculptCenter} = require(
  '../../r36ln-reference-contour-20261128/source/center_contour.cjs'
);
// center = 기존 R36KY 중심 sculpt 결과
// m = 기존 R36KZ sculptChest(center, bodySource, ...) 결과
const enhanced = sculptCenter(m, bodySource, {strength: .85});
// 이후 atlas bake와 GLB 직렬화에는 enhanced를 전달
```

**중요:** 이 코드는 작동을 위한 구현 모듈이며 이번 커밋에서 새로운 GLB 바이너리가 자동으로 생성되거나 게시되었다는 뜻은 아니다. 최종 렌더 외관은 0°·35° 비교 캡처로 별도 평가한다.

## 기존 모델 보호
- 기준 모델: `r36kz-chest-center-shape-20261128/output/R36KZ_STABLE_2088_TORSO_CENTER.glb`
- 전체 삼각형 목표: 2,088개 (머리 968, 몸체 1,120)
- 기존 63본·머리·헤어·재질·기존 GLB 경로 변경 금지
- 새 모델은 별도 출력 디렉터리/파일명에 저장

## 한계
- 제공 이미지는 단일 2D 자료이므로 크기·투영·실제 깊이 정보가 없다.
- 본 모듈은 외부 연속 표면의 얕은 조형 후보이며 세밀한 토폴로지 재구성과 최종 승인 품질에 도달했다고 주장하지 않는다.
- 소스 모듈 단독으로 게임 엔진 호환성이나 R36LN GLB의 실제 완성을 증명할 수 없다.
