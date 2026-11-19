#!/usr/bin/env python3
"""Package R148S6 cumulative OXCE + original-LOFT native S2 with safe window."""
from pathlib import Path
import shutil
import hashlib
import json
import zipfile
import datetime
import re

ROOT=Path(r"D:\daphne_auto\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")
OLD=Path(r"D:\daphne_auto\XPZ3D_R148S5_SOLID_TERRAIN_20261119")
PARENT=OLD/"R148S5_PAIRED_LOCAL_CANDIDATE"
STAGE=ROOT/"R148S6_PAIRED_LOCAL_CANDIDATE"
OX_EXE=ROOT/"build"/"openxcom_R148S6_ALLPATCH_AUTHENTIC_LOFT_ACTORS.exe"
S2_EXE=ROOT/"s2"/"Game-r148s6-loft-XPZ3D-IGScene.exe"
NEW_S2_NAME=S2_EXE.name
OLD_S2_NAME="Game-r148s5-solid-XPZ3D-IGScene.exe"
OLD_OX=PARENT/"oxce-runtime"/"openxcom.exe"
OLD_S2=PARENT/"s2-native"/OLD_S2_NAME
PARENT_RUN=PARENT/"RUN_R148S5_3D_PAIR.ps1"
PARENT_S2_RUN=PARENT/"s2-native"/"run_r148s5_solid_live_view.py"
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
    raise ValueError("R148S6 was not rebuilt")
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
 ("R148S5_S2_START_SUCCESS.json","R148S6_S2_START_SUCCESS.json"),
 ("R148S5_S2_START_ERROR.txt","R148S6_S2_START_ERROR.txt"),
 ("R148S5_S2_CHILD_STDOUT.log","R148S6_S2_CHILD_STDOUT.log"),
 ("R148S5_S2_CHILD_STDERR.log","R148S6_S2_CHILD_STDERR.log"),
 ("R148S5_S2_RENDER_FRAME.log","R148S6_S2_RENDER_FRAME.log"),
 ("R148S5_CAMERA_APPLIED.log","R148S6_CAMERA_APPLIED.log")):
    s2_script=s2_script.replace(old,new)
save_text(new_s2/"run_r148s6_loft_live_view.py",s2_script)

pair=text(PARENT_RUN)
pair=replace_case(pair,OLD_S2_NAME,NEW_S2_NAME,"pair S2 exe")
pair=replace_case(pair,"run_r148s5_solid_live_view.py",
                  "run_r148s6_loft_live_view.py","pair S2 launcher")
pair=replace_case(pair,old_ox_sha,ox_sha,"pair OXCE sha")
pair=replace_case(pair,old_s2_sha,s2_sha,"pair S2 sha")
pair=pair.replace("R148S5_PAIR_LAUNCH_RECEIPT.json",
                  "R148S6_PAIR_LAUNCH_RECEIPT.json")
pair=pair.replace("r148s5.fullpatch_f11_skin_solid_pair",
                  "r148s6.fullpatch_f11_skin_authentic_loft_pair")
pair=pair.replace("R148S5_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST",
                  "R148S6_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST")
pair=pair.replace("R148S3 AllPatch F11 skinned candidate",
                  "R148S6 Authentic LOFT F11 candidate")
pair=pair.replace("R148S3_S2_PROCESS_NOT_STARTED",
                  "R148S6_S2_PROCESS_NOT_STARTED")
pair=pair.replace("R148S3_VIEWFIX_SCRIPT_MISSING",
                  "R148S6_VIEWFIX_SCRIPT_MISSING")
pair=pair.replace("R148S3_VIEWFIX_FAILED","R148S6_VIEWFIX_FAILED")
# Avoid baking a local Windows account name into the new launcher.
pair=pair.replace(
 r"$py='C:\Users\road4\AppData\Local\Programs\Python\Python311\python.exe'",
 """$py=(Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if(!$py -and (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\\Python\\Python311\\python.exe'))){
 $py=Join-Path $env:LOCALAPPDATA 'Programs\\Python\\Python311\\python.exe'
}
if(!$py){throw 'R148S6_PYTHON311_NOT_FOUND'}""")
if not all(s in pair for s in [NEW_S2_NAME,ox_sha,s2_sha]):
    raise ValueError("R148S6 paired launcher incomplete")
save_text(STAGE/"RUN_R148S6_3D_PAIR.ps1",pair)

view=text(PARENT_VIEW)
view=replace_case(view,OLD_S2_NAME,NEW_S2_NAME,"safe view exe")
view=view.replace("R148S5_VIEWFIX_RECEIPT.json",
                  "R148S6_VIEWFIX_RECEIPT.json")
view=view.replace("xpz3d.r148s5.viewfix.sealed_mouse_window/v1",
                  "xpz3d.r148s6.viewfix.sealed_mouse_window/v1")
if "SW_SHOWNOACTIVATE" not in view or NEW_S2_NAME not in view:
    raise ValueError("R148S6 must keep mouse seal and safe reveal")
save_text(STAGE/"SHOW_XPZ3D_VIEW_ONLY.ps1",view)

def cmd(name,body):
    (STAGE/name).write_text(body,encoding="ascii",newline="\r\n")
cmd("START_XPZ3D_R148S6_GAME_AND_3D.cmd",r'''@echo off
setlocal
title XPZ3D R148S6 - Cumulative X-Piratez plus authentic LOFT 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S6_3D_PAIR.ps1" -Mode paired -CopySave "8______.sav"
if errorlevel 1 (echo XPZ3D launch failed. Review output. & pause & exit /b 1)
echo R148S6 3D viewport launched. Separate S2 window uses original LOFT occupancy.
pause
endlocal
''')
cmd("START_XPZ3D_R148S6_3D_ONLY.cmd",r'''@echo off
setlocal
title XPZ3D R148S6 - Attach 3D to running R148S6 game
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S6_3D_PAIR.ps1" -Mode s2
if errorlevel 1 (echo XPZ3D viewer launch failed. & pause & exit /b 1)
pause
endlocal
''')
cmd("SHOW_XPZ3D_R148S6_WINDOW.cmd",r'''@echo off
setlocal
title XPZ3D R148S6 - Safely show hidden 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SHOW_XPZ3D_VIEW_ONLY.ps1"
if errorlevel 1 (echo Unable to reveal S2 window. & pause & exit /b 1)
pause
endlocal
''')
(ROOT/"START_XPZ3D_R148S6_3D.cmd").write_text(
 '''@echo off\r\nsetlocal\r\ntitle XPZ3D R148S6 one click\r\ncall "%~dp0R148S6_PAIRED_LOCAL_CANDIDATE\\START_XPZ3D_R148S6_GAME_AND_3D.cmd"\r\nendlocal\r\n''',
 encoding="ascii")

readme="""# XPZ3D R148S6 - 원본 MCD/LOFT 형상 이식
기준일: 2026-11-19

## 실행
START_XPZ3D_R148S6_3D.cmd 파일을 더블클릭합니다.
기존 openxcom.exe만 실행하면 기존 2D 화면이 나오는 것이 정상입니다.
S2 3D는 안전한 별도 창에서 실행합니다.
게임이 실행 중일 때 3D만 추가하려면
R148S6_PAIRED_LOCAL_CANDIDATE/START_XPZ3D_R148S6_3D_ONLY.cmd를 사용합니다.

## 새로 실제 구현한 기능
- OXCE MapData의 12개 LOFT 높이층 ID를 각 발견된 타일의 4개 파트별로 전송합니다.
- OXCE Mod::getVoxelData() 원본 LOFTEMPS 16비트 행 데이터를 직접 메모리 맵 공유합니다.
- 게임과 동일한 XCOM voxel 판정식(LOFT-ID*16+y, bit(15-x))으로 메시 생성.
- 16x16x12 그리드로 실제 충돌 형상 노출면을 욕심쟁이(greedy) 병합합니다.
- 바닥·서벽·북벽·오브젝트 4부위를 모두 원본 LOFT 점유로 지형 메시화합니다.
- 발견되지 않은 파트/열린 문은 제외합니다.
- 큰 LOFT 메시를 여러 S2 GPU 메시로 분할하여 16비트 인덱스 한계를 피합니다.
- R148 기존 HMS·사격모드·기지 기능은 R148 누적 413개 오브젝트 아카이브에서 계승.
- R148S4 F11 63본 스키닝과 190ms 이동 보간 및 창 표시·마우스 보호는 유지.

## 한계
- 이식한 것은 게임 충돌용 실제 LOFT 점유 형상입니다.
  원본 PCK 스프라이트를 3D 재질·텍스처로 완전히 변환하지 않았습니다.
- LOFT occupancy는 MCD/LOFT 원본이며, GPU 렌더는 별도의 시각화입니다.
  충돌, 사격 판정, AI, 화재, 파괴 판정은 오직 OXCE가 처리합니다.
- 단일 8x8 지형 청크당 50,000 삼각형 상한이 있어 매우 복잡한
  장면은 부분 메시로 제한될 수 있습니다.
- 원본 게임 폴더 및 세이브는 절대 덮어쓰지 않았습니다.
- EXE 컴파일·링크는 성공했지만 실제 사용자 데스크톱의 렌더 성공은
  이번 빌드에서 아직 확정하지 않았습니다.
"""
save_text(ROOT/"README_R148S6_KO.md",readme)
save_text(STAGE/"README_R148S6_KO.md",readme)

receipt={
 "schema":"xpz3d.r148s6.oxce_original_loft_native_s2/v1",
 "version":"R148S6",
 "parent":"R148 cumulative OXCE 413 objects + R148S5 S2 F11",
 "oxce_exe":str(OX_EXE), "oxce_sha256":ox_sha,"oxce_size":OX_EXE.stat().st_size,
 "s2_exe":str(S2_EXE),"s2_sha256":s2_sha,"s2_size":S2_EXE.stat().st_size,
 "transport":"R148S6 terrain ring v3 + original OXCE LOFT row palette v1",
 "loft_layer_count":12,"loft_row_words":16,"max_loft_palette_words":131072,
 "geometry":"greedy surfaced original 16x16x12 LOFT tile collision occupancy",
 "terrain_max_triangles_per_chunk":50000,
 "original_PCK_material_texture_imported":False,
 "true_LOFT_occupancy_imported":True,
 "original_save_modified":False,
 "native_oxce_and_s2_compiled":True,
 "live_gameplay_render_verified":False,
 "viewfix":"R23R sealed mouse + SW_SHOWNOACTIVATE only",
}
save_text(ROOT/"R148S6_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))
save_text(STAGE/"R148S6_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))

archive=ROOT/"XPZ3D_R148S6_AUTHENTIC_LOFT_PAIRED_20261119.zip"
source=ROOT/"XPZ3D_R148S6_AUTHENTIC_LOFT_SOURCE_EXE_20261119.zip"
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
runtime_files.append((ROOT/"START_XPZ3D_R148S6_3D.cmd",
                      Path("START_XPZ3D_R148S6_3D.cmd")))
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
