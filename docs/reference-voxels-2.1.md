# X-Piratez 2.1 병종 복셀 높이 참조표

URL: `/reference/#unit-voxels`. JSON: `/reference/unit-voxels.json`.
현재 버전은 X-Piratez 2.1 (v.o2), OXCE 8.7.1이다. 기존 v.o1.1.1 병종 파일에서 높이를 가져오면 안 된다.

## 독립 개념

- 지도 1타일은 16×16×24복셀이다. **1×1타일 병종의 실제 피격 복셀 면적이 16×16 전체라는 뜻은 아니다.** 방어구의 loft 충돌 마스크와 높이가 결합된다.
- `RuleSoldier::standHeight`, `kneelHeight`는 기본 대원 높이이며, 무릎 자세 선택 가능성을 의미하지 않는다.
- 실제 전투값은 `BattleUnit::updateArmorFromSoldier()`: 방어구의 standHeight / kneelHeight가 **정확히 −1**일 때만 해당 Soldier 기본값을 사용한다. 부양 높이도 같은 규칙이다.
- `BattleUnit::getHeight()`는 `isKneeled()`가 참이면 `getKneelHeight()`, 거짓이면 `getStandHeight()`를 반환한다. `TileEngine::getOriginVoxel()` 총탄 출발 Z는 해당 자세 높이 + 부양 높이 − 지형 레벨 − 4이다(일반 비투척 발사, 평지). 따라서 서기와 무릎 사격은 각자의 출발 Z가 존재한다. 투척은 −3을 사용한다. 총구 높이를 종족의 서 있는 키와 동일시하면 안 된다.
- 방어구의 `size`는 가로·세로 점유 **타일** 단위이며 복셀 실루엣의 정확한 폭과 다르다.
- `Armor::loftempsSet`은 충돌 마스크의 **ID 목록**이다. 엔진 `TileEngine::voxelCheck()`는 높이 범위 안에서도 이 마스크를 검사하므로, 키와 점유가 같더라도 템플릿이 바뀌면 측면 오발/피격이 달라질 수 있다. 템플릿 ID 4를 폭 4복셀이라고 잘못 해석하지 않는다.
- `allowsKneeling: false`는 명시적 제약으로 기록한다. 표에 계산된 무릎 사격 출발 Z가 있어도 사용 불가 장비에서는 **가상 참고값**만 의미한다. `null`은 명시된 값이 없다는 뜻으로, 런타임에서 반드시 무릎을 꿇을 수 있다는 보증이 아니다.
- 조준선이 머리보다 높다고 해서 오발 확률이 자동으로 0%가 되지 않는다. `Projectile::applyAccuracy()`는 투사체의 실제 경로를 산포시킨다.

## 검증된 병종 예시

| ID | 서기 | 무릎 | 평지 서서 발사 Z | 평지 무릎 발사 Z |
|---|---:|---:|---:|---:|
| STR_SOLDIER (일반 갈/미치광이) | 22 | 14 | 18 | 10 |
| STR_SOLDIER_LOKNAR (로크'나르) | 17 | 11 | 13 | 7 |
| STR_SOLDIER_NEKOMIMI (캣걸) | 21 | 13 | 17 | 9 |
| STR_SOLDIER_PUREBLOOD (순수혈통 병사) | 22 | 13 | 18 | 9 |
| STR_SOLDIER_DOGE (해적견) | 12 | 12 | 8 | 8 |

**블러드하운드를 탄 로크나르**는 `STR_LOKNAR_PLATE_MAIL_RIDER_UC` (라이더/로크나르) 방어구다. 일반 로크나르와 같은 서기/무릎 높이 **17/11**, 사격 출발 **13/7**, 타일 점유 **1×1**을 유지하지만, **복셀 충돌 템플릿**은 기본 로크나르의 `[2]`가 아니라 **`[4]`**이다 (`Piratez.rul`의 라이더 `loftempsSet: [4]`, 코트/판금갑옷은 `[2]`, `Piratez_Armors.rul`의 `BLOOD_MOUNT_ARMORED`). 사이트는 이 변형을 이름으로 검색할 수 있게 하며, 키가 같아도 예외 필터에서 보여준다. 설치본 `GEODATA/LOFTEMPS.DAT` (SHA-256 `72756b63c8f95e0d97ae2faacf4452d2e39a7d407deb451c526540306ced387c`)를 32바이트/템플릿, 16×16 비트마스크로 해독하면 기본 ID 2는 **최대 5×5 / 실제 점유 21복셀/층**, 탑승 ID 4는 **최대 9×9 / 실제 점유 61복셀/층**이다. 61/21=약 2.90배는 수평 점유 단면적 비율이지 명중률 비율이 아니다. 사격이나 회피 확률의 실제 차이는 OXCE 복셀별 경로 평가가 필요하다.

2026-10-27 설치 룰에서 기본 병종 29종, 이들에게 배정/장착 가능한 방어구 540종을 추출했다. 현재 방어구의 실효 standHeight/kneelHeight 직접 오버라이드는 없었고, `size:2`인 방어구 46종 및 명시적으로 `allowsKneeling:false`인 방어구 99종이 있었다. 따라서 높이 29종과 자세/점유 예외는 **별개**다. 룰 변경 시 이 집계는 다시 생성해야 한다.

## 데이터 생성 및 검증

`tools/build-data.mjs --unit-voxels-only --source <.../user/mods/Piratez>`는 X-Piratez 2.1 룰셋의 병종/방어구 항목을 기존 `build-data`와 동일한 refNode/동일 ID 병합 처리로 읽고 `GEODATA/LOFTEMPS.DAT`의 실제 16×16 수평 충돌 마스크도 해독해 `public/reference/unit-voxels.json`을 갱신한다.

일반 `--soldiers-modern-only` 작업 역시 참조표를 갱신하지만, 고전 v.o1.1.1 데이터 빌드에서는 참조표를 바꾸지 않는다. JSON의 `sourceHashes`와 해당 병종·방어구 `sourceFiles`로 출처를 확인한다.

검증:
`node tools/check-reference.mjs` (원본 메타 해시와 29종 병종 값 대조)
`node tools/check-reference-browser.mjs` (실제 브라우저 검색·필터·서기/무릎 발사 Z·금지 방어구 표시 검증).

엔진 근거:
- `src/Savegame/BattleUnit.cpp`: `updateArmorFromSoldier`, `getHeight`
- `src/Battlescape/TileEngine.cpp`: `getOriginVoxel`
- `src/Battlescape/Projectile.cpp`: `applyAccuracy`
- `src/Mod/Armor.cpp`: 기본 높이 오버라이드 −1, 기본 점유 size 1
- `src/Mod/RuleSoldier.cpp`: 병종 높이 원시 룰 읽기
