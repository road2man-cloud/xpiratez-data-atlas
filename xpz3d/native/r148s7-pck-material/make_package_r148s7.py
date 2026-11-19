#!/usr/bin/env python3
"""Derive isolated S7 PCK-colored native runtime packager from S6 baseline."""
from pathlib import Path
a=Path(r"D:\daphne_auto\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")
b=Path(r"D:\daphne_auto\XPZ3D_R148S7_PCK_MATERIAL_20261119")
x=(a/"package_r148s6.py").read_text(encoding="utf8")
x=x.replace("XPZ3D_R148S6_AUTHENTIC_LOFT_20261119",
            "XPZ3D_R148S7_PCK_MATERIAL_20261119")
x=x.replace("r148s6","r148s7").replace("R148S6","R148S7")
x=x.replace("AUTHENTIC_LOFT_ACTORS","LOFT_PCK_ACTORS")
x=x.replace("r148s7-loft","r148s7-pck")
x=x.replace("R148S7_AUTHENTIC_LOFT","R148S7_LOFT_PCK")
x=x.replace("R148S7_LOFT_PCK_PAIRED_20261119","R148S7_LOFT_PCK_PAIRED_20261119")
x=x.replace("R148S7_LOFT_PCK_SOURCE_EXE_20261119","R148S7_LOFT_PCK_SOURCE_EXE_20261119")
# The old-side paths MUST point to the existing, independently produced S6
# runtime. Never repackage by copying its S2 EXE as the current output.
x=x.replace(
  'OLD=Path(r"D:\\daphne_auto\\XPZ3D_R148S5_SOLID_TERRAIN_20261119")',
  'OLD=Path(r"D:\\daphne_auto\\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")')
x=x.replace('PARENT=OLD/"R148S5_PAIRED_LOCAL_CANDIDATE"',
            'PARENT=OLD/"R148S6_PAIRED_LOCAL_CANDIDATE"')
x=x.replace('OLD_S2_NAME="Game-r148s5-solid-XPZ3D-IGScene.exe"',
            'OLD_S2_NAME="Game-r148s6-loft-XPZ3D-IGScene.exe"')
x=x.replace('PARENT/"RUN_R148S5_3D_PAIR.ps1"',
            'PARENT/"RUN_R148S6_3D_PAIR.ps1"')
x=x.replace('PARENT/"s2-native"/"run_r148s5_solid_live_view.py"',
            'PARENT/"s2-native"/"run_r148s6_loft_live_view.py"')
x=x.replace('"run_r148s5_solid_live_view.py",',
            '"run_r148s6_loft_live_view.py",')
x=x.replace('"run_r148s7_loft_live_view.py","pair S2 launcher"',
            '"run_r148s7_pck_live_view.py","pair S2 launcher"')
x=x.replace('new_s2/"run_r148s7_loft_live_view.py"',
            'new_s2/"run_r148s7_pck_live_view.py"')
x=x.replace('pair=pair.replace("r148s5.fullpatch_f11_skin_solid_pair",',
            'pair=pair.replace("r148s6.fullpatch_f11_skin_authentic_loft_pair",')
x=x.replace('pair=pair.replace("R148S5_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST",',
            'pair=pair.replace("R148S6_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST",')
# Old runner logs really use S6 prefixes.
for name in (
 "S2_START_SUCCESS.json","S2_START_ERROR.txt","S2_CHILD_STDOUT.log",
 "S2_CHILD_STDERR.log","S2_RENDER_FRAME.log","CAMERA_APPLIED.log"):
    x=x.replace('("R148S5_'+name+'","R148S7_'+name+'")',
                '("R148S6_'+name+'","R148S7_'+name+'")')
# The S6 runtime has R148S6 receipt names. Normalise them to the S7 names.
x=x.replace('pair=pair.replace("R148S5_PAIR_LAUNCH_RECEIPT.json",',
            'pair=pair.replace("R148S6_PAIR_LAUNCH_RECEIPT.json",')
x=x.replace('view=view.replace("R148S5_VIEWFIX_RECEIPT.json",',
            'view=view.replace("R148S6_VIEWFIX_RECEIPT.json",')
x=x.replace('view=view.replace("xpz3d.r148s5.viewfix.sealed_mouse_window/v1",',
            'view=view.replace("xpz3d.r148s6.viewfix.sealed_mouse_window/v1",')
# Ensure the S6 renderer filename is not accidentally used as the new one.
x=x.replace("original LOFT occupancy", "original LOFT occupancy with PCK-derived material colours")
readme_start=x.index('readme="""')
readme_end=x.index('"""\nsave_text(ROOT/"README_',readme_start)+3
readme='''readme="""# XPZ3D R148S7 — 원본 PCK/MCD 색상 기반 3D 지형 재질
기준일: 2026-11-19

## 실행 방법
START_XPZ3D_R148S7_3D.cmd 더블클릭: 독립 X-Piratez + S2 3D 창 동시 실행.
게임이 이미 실행 중이라면 R148S7_PAIRED_LOCAL_CANDIDATE 안의
START_XPZ3D_R148S7_3D_ONLY.cmd로 S2 창만 시작할 수 있습니다.
게임 창에 3D 전환 버튼이 생긴 것이 아니며, 일반 openxcom.exe
단독 실행에서는 기존 2D 화면만 표시됩니다.

## R148S7 실제 구현
- OXCE의 MCD 데이터별 원본 PCK/8bpp 스프라이트 frame 0 읽기.
- 게임에서 쓰는 현재 화면 팔레트로 PCK 색상 복원.
- 투명 인덱스 0을 제외한 PCK 4개 이미지 영역 대표색.
- 타일별 네 파트(바닥, 서벽, 북벽, 오브젝트)의 4개 색을
  R148S7 11,584바이트 버전4 지형 패킷으로 전송.
- R148S6의 원본 LOFT 점유 16x16x12 메시와 결합.
- 실제 PCK 색상의 빈도를 고려한 청크별 최대 16색 적응형
  재질 팔레트로 S2 IGScene GPU 메시 생성.
- R148S4 F11 63관절 보행·자세·위치보간 유지.
- R148 누적 413개 OXCE 오브젝트 아카이브 기반 새 EXE 생성.
- 이전 R23R 마우스 안전 차단과 숨김 창 안전 표시 유지.
- 원본 설치 EXE, 기존 빌드, 사용자 세이브에는 영향 없음.

## 남은 한계
현재는 원본 PCK의 대표색·영역색을 3D LOFT 표면에 매핑하는
개선이며, 정확한 PCK 픽셀 UV 좌표, 원본 물체 입체 텍스처,
원본 조명/반사/투명 재질을 전부 재현한 것은 아닙니다.
원본 지형 외관의 완전 복원 또는 실전 3D 프레임 정상 표시는
이 빌드의 컴파일·패키징 결과만으로 보증하지 않습니다.
"""'''
x=x[:readme_start]+readme+x[readme_end:]
x=x.replace('"schema":"xpz3d.r148s7.oxce_original_loft_native_s2/v1",',
            '"schema":"xpz3d.r148s7.oxce_original_loft_pck_material_native_s2/v1",')
x=x.replace(' "transport":"R148S7 terrain ring v3 + original OXCE LOFT row palette v1",',
            ' "transport":"R148S7 terrain ring v4 + LOFT row palette v1 + PCK sprite 4-region RGB",')
x=x.replace(' "original_PCK_material_texture_imported":False,',
            ''' "original_PCK_material_texture_imported":False,
 "original_PCK_2x2_region_rgb_imported":True,
 "adaptive_native_materials_per_chunk":16,
 "original_PCK_uv_textures_imported":False,''')
x=x.replace(' "original_save_modified":False,',
            ' "original_save_modified":False,\n "previous_S6_binary_modified":False,')
x=x.replace("PAIRED_20261119.zip","PAIRED_20261119.zip")
# New source code generated with unique kernel/protocol IDs. If this key is
# missing the parent script has drifted; refuse rather than ship wrong version.
for key in [
  'OLD_S2_NAME="Game-r148s6-loft-XPZ3D-IGScene.exe"',
  'NEW_S2_NAME=S2_EXE.name',
  'run_r148s7_pck_live_view.py',
  'R148S7_PAIRED_LOCAL_CANDIDATE',
  'PCK sprite 4-region RGB'
]:
    if key not in x:raise RuntimeError("MISSING_PACKAGER_MARKER "+key)
(b/"package_r148s7.py").write_text(x,encoding="utf8")
print("S7_PACKAGER_GENERATED",len(x))
