#!/usr/bin/env python3
"""Package R148S7 cumulative OXCE + original-LOFT native S2 with safe window."""
from pathlib import Path
import shutil
import hashlib
import json
import zipfile
import datetime
import re

ROOT=Path(r"D:\daphne_auto\XPZ3D_R148S7_PCK_MATERIAL_20261119")
OLD=Path(r"D:\daphne_auto\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")
PARENT=OLD/"R148S6_PAIRED_LOCAL_CANDIDATE"
STAGE=ROOT/"R148S7_PAIRED_LOCAL_CANDIDATE"
OX_EXE=ROOT/"build"/"openxcom_R148S7_ALLPATCH_LOFT_PCK_ACTORS.exe"
S2_EXE=ROOT/"s2"/"Game-r148s7-pck-XPZ3D-IGScene.exe"
NEW_S2_NAME=S2_EXE.name
OLD_S2_NAME="Game-r148s6-loft-XPZ3D-IGScene.exe"
OLD_OX=PARENT/"oxce-runtime"/"openxcom.exe"
OLD_S2=PARENT/"s2-native"/OLD_S2_NAME
PARENT_RUN=PARENT/"RUN_R148S6_3D_PAIR.ps1"
PARENT_S2_RUN=PARENT/"s2-native"/"run_r148s6_loft_live_view.py"
PARENT_VIEW=PARENT/"SHOW_XPZ3D_VIEW_ONLY.ps1"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def text(path):return path.read_text(encoding="utf-8-sig")
def save_text(path,s):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(s,encoding="utf-8-sig")
def replace_case(blob,old,new,name):
    result,num=re.subn(re.escape(old),lambda _:new,blob,flags=re.I)
    if num<1:
        raise ValueError(f"{name}: parent reference not found: {old}")
    return result

for f in [OX_EXE,S2_EXE,OLD_OX,OLD_S2,PARENT_RUN,PARENT_S2_RUN,PARENT_VIEW]:
    if not f.is_file():raise FileNotFoundError(str(f))
ox_sha=sha(OX_EXE); s2_sha=sha(S2_EXE)
old_ox_sha=sha(OLD_OX); old_s2_sha=sha(OLD_S2)
if ox_sha==old_ox_sha or s2_sha==old_s2_sha:
    raise ValueError("R148S7 was not rebuilt")
STAGE.mkdir(parents=True,exist_ok=True)
# Do not delete or rewrite parent runtimes, other developers or user saves.
new_ox=STAGE/"oxce-runtime"
if not new_ox.exists():
    shutil.copytree(PARENT/"oxce-runtime",new_ox,
                    ignore=shutil.ignore_patterns("*.log","*.tmp","*.bak"))
shutil.copy2(OX_EXE,new_ox/"openxcom.exe")
new_s2=STAGE/"s2-native"
(new_s2/"assets").mkdir(parents=True,exist_ok=True)
shutil.copy2(S2_EXE,new_s2/NEW_S2_NAME)
for name in ("f11_r34q.skin","f11_r34x.skin",
             "f11_r34q.manifest.json","f11_r34x.manifest.json"):
    shutil.copy2(ROOT/"s2"/"assets"/name,new_s2/"assets"/name)

s2_script=text(PARENT_S2_RUN)
s2_script=replace_case(s2_script,OLD_S2_NAME,NEW_S2_NAME,"S2 exe path")
s2_script=replace_case(s2_script,old_s2_sha.lower(),s2_sha.lower(),"S2 SHA")
for old,new in (
 ("R148S6_S2_START_SUCCESS.json","R148S7_S2_START_SUCCESS.json"),
 ("R148S6_S2_START_ERROR.txt","R148S7_S2_START_ERROR.txt"),
 ("R148S6_S2_CHILD_STDOUT.log","R148S7_S2_CHILD_STDOUT.log"),
 ("R148S6_S2_CHILD_STDERR.log","R148S7_S2_CHILD_STDERR.log"),
 ("R148S6_S2_RENDER_FRAME.log","R148S7_S2_RENDER_FRAME.log"),
 ("R148S6_CAMERA_APPLIED.log","R148S7_CAMERA_APPLIED.log")):
    s2_script=s2_script.replace(old,new)
save_text(new_s2/"run_r148s7_pck_live_view.py",s2_script)

pair=text(PARENT_RUN)
pair=replace_case(pair,OLD_S2_NAME,NEW_S2_NAME,"pair S2 exe")
pair=replace_case(pair,"run_r148s6_loft_live_view.py",
                  "run_r148s7_pck_live_view.py","pair S2 launcher")
pair=replace_case(pair,old_ox_sha,ox_sha,"pair OXCE sha")
pair=replace_case(pair,old_s2_sha,s2_sha,"pair S2 sha")
pair=pair.replace("R148S6_PAIR_LAUNCH_RECEIPT.json",
                  "R148S7_PAIR_LAUNCH_RECEIPT.json")
pair=pair.replace("r148s6.fullpatch_f11_skin_authentic_loft_pair",
                  "r148s7.fullpatch_f11_skin_authentic_loft_pair")
pair=pair.replace("R148S6_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST",
                  "R148S7_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST")
pair=pair.replace("R148S3 AllPatch F11 skinned candidate",
                  "R148S7 Authentic LOFT F11 candidate")
pair=pair.replace("R148S3_S2_PROCESS_NOT_STARTED",
                  "R148S7_S2_PROCESS_NOT_STARTED")
pair=pair.replace("R148S3_VIEWFIX_SCRIPT_MISSING",
                  "R148S7_VIEWFIX_SCRIPT_MISSING")
pair=pair.replace("R148S3_VIEWFIX_FAILED","R148S7_VIEWFIX_FAILED")
# Avoid baking a local Windows account name into the new launcher.
pair=pair.replace(
 r"$py='C:\Users\road4\AppData\Local\Programs\Python\Python311\python.exe'",
 """$py=(Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if(!$py -and (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\\Python\\Python311\\python.exe'))){
 $py=Join-Path $env:LOCALAPPDATA 'Programs\\Python\\Python311\\python.exe'
}
if(!$py){throw 'R148S7_PYTHON311_NOT_FOUND'}""")
if not all(s in pair for s in [NEW_S2_NAME,ox_sha,s2_sha]):
    raise ValueError("R148S7 paired launcher incomplete")
save_text(STAGE/"RUN_R148S7_3D_PAIR.ps1",pair)

view=text(PARENT_VIEW)
view=replace_case(view,OLD_S2_NAME,NEW_S2_NAME,"safe view exe")
view=view.replace("R148S6_VIEWFIX_RECEIPT.json",
                  "R148S7_VIEWFIX_RECEIPT.json")
view=view.replace("xpz3d.r148s6.viewfix.sealed_mouse_window/v1",
                  "xpz3d.r148s7.viewfix.sealed_mouse_window/v1")
if "SW_SHOWNOACTIVATE" not in view or NEW_S2_NAME not in view:
    raise ValueError("R148S7 must keep mouse seal and safe reveal")
save_text(STAGE/"SHOW_XPZ3D_VIEW_ONLY.ps1",view)

def cmd(name,body):
    (STAGE/name).write_text(body,encoding="ascii",newline="\r\n")
cmd("START_XPZ3D_R148S7_GAME_AND_3D.cmd",r'''@echo off
setlocal
title XPZ3D R148S7 - Cumulative X-Piratez plus authentic LOFT 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S7_3D_PAIR.ps1" -Mode paired -CopySave "8______.sav"
if errorlevel 1 (echo XPZ3D launch failed. Review output. & pause & exit /b 1)
echo R148S7 3D viewport launched. Separate S2 window uses original LOFT occupancy with PCK-derived material colours.
pause
endlocal
''')
cmd("START_XPZ3D_R148S7_3D_ONLY.cmd",r'''@echo off
setlocal
title XPZ3D R148S7 - Attach 3D to running R148S7 game
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S7_3D_PAIR.ps1" -Mode s2
if errorlevel 1 (echo XPZ3D viewer launch failed. & pause & exit /b 1)
pause
endlocal
''')
cmd("SHOW_XPZ3D_R148S7_WINDOW.cmd",r'''@echo off
setlocal
title XPZ3D R148S7 - Safely show hidden 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SHOW_XPZ3D_VIEW_ONLY.ps1"
if errorlevel 1 (echo Unable to reveal S2 window. & pause & exit /b 1)
pause
endlocal
''')
(ROOT/"START_XPZ3D_R148S7_3D.cmd").write_text(
 '''@echo off\r\nsetlocal\r\ntitle XPZ3D R148S7 one click\r\ncall "%~dp0R148S7_PAIRED_LOCAL_CANDIDATE\\START_XPZ3D_R148S7_GAME_AND_3D.cmd"\r\nendlocal\r\n''',
 encoding="ascii")

readme="""# XPZ3D R148S7 — 원본 PCK/MCD 색상 기반 3D 지형 재질
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
"""
save_text(ROOT/"README_R148S7_KO.md",readme)
save_text(STAGE/"README_R148S7_KO.md",readme)

receipt={
 "schema":"xpz3d.r148s7.oxce_original_loft_pck_material_native_s2/v1",
 "version":"R148S7",
 "parent":"R148 cumulative OXCE 413 objects + R148S5 S2 F11",
 "oxce_exe":str(OX_EXE), "oxce_sha256":ox_sha,"oxce_size":OX_EXE.stat().st_size,
 "s2_exe":str(S2_EXE),"s2_sha256":s2_sha,"s2_size":S2_EXE.stat().st_size,
 "transport":"R148S7 terrain ring v4 + LOFT row palette v1 + PCK sprite 4-region RGB",
 "loft_layer_count":12,"loft_row_words":16,"max_loft_palette_words":131072,
 "geometry":"greedy surfaced original 16x16x12 LOFT tile collision occupancy",
 "terrain_max_triangles_per_chunk":50000,
 "original_PCK_material_texture_imported":False,
 "original_PCK_2x2_region_rgb_imported":True,
 "adaptive_native_materials_per_chunk":16,
 "original_PCK_uv_textures_imported":False,
 "true_LOFT_occupancy_imported":True,
 "original_save_modified":False,
 "previous_S6_binary_modified":False,
 "native_oxce_and_s2_compiled":True,
 "live_gameplay_render_verified":False,
 "viewfix":"R23R sealed mouse + SW_SHOWNOACTIVATE only",
}
save_text(ROOT/"R148S7_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))
save_text(STAGE/"R148S7_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))

archive=ROOT/"XPZ3D_R148S7_LOFT_PCK_PAIRED_20261119.zip"
source=ROOT/"XPZ3D_R148S7_LOFT_PCK_SOURCE_EXE_20261119.zip"
def archive_files(target,files):
    with zipfile.ZipFile(target,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,
                         allowZip64=True) as zipf:
        seen=set()
        for physical,arc in files:
            if physical in seen:continue
            seen.add(physical)
            if not physical.is_file():raise FileNotFoundError(str(physical))
            zipf.write(physical,arcname=arc)
    print("PACKAGE",target,str(target.stat().st_size),
          sha(target),flush=True)
runtime_files=[(f, f.relative_to(ROOT)) for f in STAGE.rglob("*")
               if f.is_file() and not f.name.lower().endswith((".log",".tmp",".bak"))]
runtime_files.append((ROOT/"START_XPZ3D_R148S7_3D.cmd",
                      Path("START_XPZ3D_R148S7_3D.cmd")))
archive_files(archive,runtime_files)
sourced=[]
for area in ("oxce","s2"):
    for f in (ROOT/area).rglob("*"):
        if not f.is_file() or f.suffix.lower() in (".obj",".map",".lib",".pdb",".log",".manifest"):
            continue
        if f.suffix.lower() in (".a",".exp"):
            continue
        sourced.append((f,f.relative_to(ROOT)))
sourced.append((OX_EXE,Path("bin")/OX_EXE.name))
sourced.append((S2_EXE,Path("bin")/S2_EXE.name))
for f in ROOT.glob("*"):
    if f.suffix.lower() in (".py",".ps1",".md",".json",".cmd") and f.is_file():
        sourced.append((f,f.relative_to(ROOT)))
archive_files(source,sourced)
