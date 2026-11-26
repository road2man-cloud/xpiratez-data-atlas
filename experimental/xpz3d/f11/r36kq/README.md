# R36KQ — produced from supplied R36KP 1024/512 GLBs

2026-11-27 production notes. This derivative is **NOT** the older R36KK seam-v3.

The user-supplied artifact `XPZ3D_R36KP_GITHUB_HANDOFF_BUNDLE_20261127.zip` contained the exact source binaries:

- 1024: `R36KP_F11_MEDIAL_HIP_BLEND_1024_2100TRI.glb`, SHA256 `285d9c17848992231da5ffc10ebc6d807b52da1e577c64147bb5408a53584829`
- 512: `R36KP_F11_MEDIAL_HIP_BLEND_512_2100TRI.glb`, SHA256 `1a89353c3a2b15cf1e0073be2c72c2b962bd263622b3288e1f678c39e6112c04`

## New local output

- `R36KQ_F11_HIP_TRANSITION_1024_2100TRI.glb` (430848 bytes), SHA256 `25950c044d6ee59a32552432be8cbf191fb0b5f3120ab032e3e9b54e0a8f87c4`
- `R36KQ_F11_HIP_TRANSITION_512_2100TRI.glb` (315364 bytes), SHA256 `bd67abee6c0220c6767b9af6071ebba612870f886bcf869973af574e4440f41f`

The outputs are built by `build_r36kq.py` against the exact source GLBs, modifying **POSITION and NORMAL only** in left and right leg primitives 10/11. Inputs preserve skin textures (original dark R36HW-derived tone), protected face/hair/hands, UV, indices, joints/weights and 63-bone rig. Triangles remain 2100.

Mean selected ring gap left: 0.00882460 → 0.00749345. Right: 0.00744981 → 0.00646235 (model units). This is an actual geometric derivation, not a topology weld or an S2/S3 in-game result.

## GitHub 전달 현황 (2026-11-27 갱신)

- R36KP 원본 GLB 1024/512 및 피부 텍스처 6종: `../r36kp/originals/`에 실제 바이너리 업로드됨
- R36KQ 1024/512 GLB 및 `build_r36kq.py`: 본 `r36kq/` 폴더에 실제 업로드됨
- 신규 파생 R36KR 1024/512 GLB 및 제작 코드·포즈 보고서: `../r36kr/` 업로드됨
- 최초 바이너리 업로드 커밋: `af4423f674f23be8fc19755bab9e9f9225668f93`
- 분리된 `r36kp/seam_v3` 모델은 **R36KK 파생본**이며 R36KP/R36KQ/R36KR 기준본과 별개의 계보입니다.
- 게임 엔진 S2/S3 적용 및 완전 위상 용접은 여전히 미완료입니다.

## Next steps

Use R36KQ as an exact SHA-256 locked comparison baseline. R36KR is the current derived version; use `../r36kr/` for source, build reports and captures. Continue pose-driven seam refinement without changing protected facial/material primitives. Game engine integration and full topology welding remain open.
