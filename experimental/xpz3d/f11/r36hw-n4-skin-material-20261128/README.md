# R36HW-N4 — R36HW 보존형 재질 고도화

## 실제 GitHub 게시 결과

- **모델**: `output/R36HW_N4_SKIN_DETAIL.glb`
- **Node.js 생산기**: `source/build_r36hw_n4.cjs`
- **생산 보고서**: `reports/R36HW_N4_SKIN_DETAIL.json`
- **성공한 자동 빌드**: [Actions #46156950338](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46156950338)
- **SHA-256**: `82e085bd91e8e48d2d6e6794047b54d39d47c2abe5940c184e12c45a25114482`

N3 R36HW 직접 보존형 2,076삼각형 GLB를 그대로 입력으로 사용한다. 원본 얼굴과 머리카락을 수정하지 않고 의복에서 피부 재질로 전환된 4개 primitive에 512x512 컬러 PNG와 미세 노멀 PNG를 추가했다. PNG는 GLB 내부 BIN에 포함하며 외부 라이브러리·원본 사진 전체·R36JB 몸체는 사용하지 않는다. 본 계층 63개를 유지한다.

사용자 이미지의 국소 함몰은 N3의 정점 변형에 한정하며, N4 신규 PNG는 **미세 질감**이다. 이미지 사진을 통째로 투영한 것이 아니다. 이를 피부 복원의 완료 또는 사진과의 미술적 동등성으로 간주해서는 안 된다.

**현실적 한계:** 원래 옷의 메시 실루엣과 숨겨진 피부가 남아 있다. 텍스처만으로는 이를 해결할 수 없다. N4 GLB의 UV/노멀은 Three.js 뷰어에서 진단 가능하지만 **기존 네이티브 S2 CMemObject 연결은 피부 텍스처와 노멀맵을 렌더하지 못한다.**

[동일 카메라 진단 GLB 뷰어](../r36hw-n3-curvature-20261128/preview/index.html)에서 R36HW / N2 / N3 / N4를 선택 가능하다. 이 미리보기는 네이티브 S2가 아니며 아트 승인을 대체하지 않는다.

실제 N4의 정적 삼각형을 S2 XPZC 패킷으로 변환한 R138J 어댑터는 `../r138j-hw-native-adapter-20261128/`에 있으며 Win32 빌드는 원본과 분리된 경로에서 완료되었다. 실행 중 실시간 스키닝과 UV/PBR이 보장된 것은 아니다.
