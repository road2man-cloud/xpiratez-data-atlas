#!/usr/bin/env python3
"""R148S10 isolated cumulative OXCE + R148S7 S2 with mouse-safe 3D docking."""
from pathlib import Path
import hashlib, shutil, json, zipfile

ROOT=Path(r"D:\daphne_auto\XPZ3D_R148S10_DOCKED_VIEW_20261119")
PARENT=Path(r"D:\daphne_auto\XPZ3D_R148S9_VIEWER_TOGGLE_20261119\R148S9_PAIRED_LOCAL_CANDIDATE")
STAGE=ROOT/"R148S10_PAIRED_LOCAL_CANDIDATE"
OX=ROOT/"build"/"openxcom_R148S10_ALLPATCH_LOFT_PCK_DOCKED_3D.exe"
OLD_OX=PARENT/"oxce-runtime"/"openxcom.exe"
S2=PARENT/"s2-native"/"Game-r148s7-pck-XPZ3D-IGScene.exe"
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest().upper()
def read(f):return f.read_text(encoding="utf-8-sig")
def save(f,s):
    f.parent.mkdir(parents=True,exist_ok=True)
    f.write_text(s,encoding="utf-8-sig")
def copy(f,d):
    d.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(f,d)
for f in (OX,OLD_OX,S2,PARENT/"RUN_R148S9_3D_PAIR.ps1",
          ROOT/"XPZ3D_WINDOW_CONTROL.ps1",ROOT/"XPZ3D_INBATTLE_CONTROLLER.ps1"):
    if not f.is_file():raise FileNotFoundError(str(f))
new_sha=sha(OX);parent_sha=sha(OLD_OX);s2_sha=sha(S2)
if new_sha==parent_sha:raise ValueError("R148S10 OXCE was not rebuilt")
STAGE.mkdir(parents=True,exist_ok=True)
ox_runtime=STAGE/"oxce-runtime"
if not ox_runtime.exists():
    shutil.copytree(PARENT/"oxce-runtime",ox_runtime,
        ignore=shutil.ignore_patterns("*.log","*.tmp","*.bak"))
copy(OX,ox_runtime/"openxcom.exe")
viewer=STAGE/"s2-native"
viewer.mkdir(parents=True,exist_ok=True)
for f in (PARENT/"s2-native").rglob("*"):
    if not f.is_file() or f.name.lower().endswith((".log",".tmp",".bak")):continue
    copy(f,viewer/f.relative_to(PARENT/"s2-native"))
if sha(viewer/S2.name)!=s2_sha:raise ValueError("R148S7 S2 parent modified")

run=read(PARENT/"RUN_R148S9_3D_PAIR.ps1")
if run.count(parent_sha)!=1:raise ValueError("Expected exactly one R148S9 game SHA")
run=run.replace(parent_sha,new_sha)
run=run.replace("R148S9","R148S10").replace("r148s9","r148s10")
if "SHOW_XPZ3D_VIEW_ONLY.ps1" not in run or "R148S10_PAIR_LAUNCH_RECEIPT.json" not in run:
    raise ValueError("Failed to retain safe S2 display command")
save(STAGE/"RUN_R148S10_3D_PAIR.ps1",run)
copy(ROOT/"XPZ3D_WINDOW_CONTROL.ps1",STAGE/"XPZ3D_WINDOW_CONTROL.ps1")
copy(ROOT/"XPZ3D_INBATTLE_CONTROLLER.ps1",STAGE/"XPZ3D_INBATTLE_CONTROLLER.ps1")

save(STAGE/"SHOW_XPZ3D_VIEW_ONLY.ps1", """param([int]$S2Pid=0)
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $stage 'XPZ3D_WINDOW_CONTROL.ps1') -Action Show -S2Pid $S2Pid
""")
save(STAGE/"TOGGLE_XPZ3D_FROM_GAME.ps1", """$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $stage 'XPZ3D_INBATTLE_CONTROLLER.ps1') -Request Toggle
""")
save(STAGE/"DOCK_XPZ3D_FROM_GAME.ps1", """$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $stage 'XPZ3D_INBATTLE_CONTROLLER.ps1') -Request Cycle
""")
# Directly running the development build/ EXE also finds its parent scripts.
save(ROOT/"TOGGLE_XPZ3D_FROM_GAME.ps1", """$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root 'R148S10_PAIRED_LOCAL_CANDIDATE\\TOGGLE_XPZ3D_FROM_GAME.ps1')
""")
save(ROOT/"DOCK_XPZ3D_FROM_GAME.ps1", """$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root 'R148S10_PAIRED_LOCAL_CANDIDATE\\DOCK_XPZ3D_FROM_GAME.ps1')
""")

def cmd(path,s):path.write_text(s,encoding="ascii",newline="\r\n")
cmd(STAGE/"START_XPZ3D_R148S10_GAME_AND_3D.cmd",r'''@echo off
setlocal
title XPZ3D R148S10 - Cumulative OXCE and docked native 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S10_3D_PAIR.ps1" -Mode paired -CopySave "8______.sav"
if errorlevel 1 (echo XPZ3D failed. See launcher output. & pause & exit /b 1)
echo In tactical battle: Ctrl+Alt+F10 show-hide, Ctrl+Alt+F9 dock right-left-float.
pause
endlocal
''')
cmd(STAGE/"START_XPZ3D_R148S10_GAME_ONLY.cmd",r'''@echo off
setlocal
title XPZ3D R148S10 - game only with 3D window hotkeys
set "ROOT=%~dp0"
set "DATA=D:\daphne_auto\_xpz3d_launch_integration_20261117\r135-battle-camera-20261117\paired-runtime\data"
set "USER=%ROOT%isolated-user"
if not exist "%USER%\piratez\8______.sav" (
 echo Isolated test save missing: run GAME_AND_3D once first.
 pause
 exit /b 1
)
start "" /D "%ROOT%oxce-runtime" "%ROOT%oxce-runtime\openxcom.exe" -data "%DATA%" -user "%USER%" -cfg "%USER%" -master piratez -load "8______.sav"
endlocal
''')
cmd(STAGE/"TOGGLE_XPZ3D_R148S10_WINDOW.cmd",r'''@echo off
setlocal
title XPZ3D R148S10 - show or hide 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TOGGLE_XPZ3D_FROM_GAME.ps1"
if errorlevel 1 (echo 3D toggle failed. & pause & exit /b 1)
endlocal
''')
cmd(STAGE/"CYCLE_XPZ3D_R148S10_LAYOUT.cmd",r'''@echo off
setlocal
title XPZ3D R148S10 - cycle 3D position
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DOCK_XPZ3D_FROM_GAME.ps1"
if errorlevel 1 (echo 3D layout failed. & pause & exit /b 1)
endlocal
''')
cmd(ROOT/"START_XPZ3D_R148S10_3D.cmd",r'''@echo off
setlocal
title XPZ3D R148S10 - start native 3D
call "%~dp0R148S10_PAIRED_LOCAL_CANDIDATE\START_XPZ3D_R148S10_GAME_AND_3D.cmd"
endlocal
''')
readme="""# XPZ3D R148S10 — 2D 게임 옆 3D 창 자동 배치
2026년 11월 19일

## 실제 개발 기능
- 전술 화면 Ctrl+Alt+F10: 3D 뷰어 시작 / 표시 / 숨김.
- 전술 화면 Ctrl+Alt+F9: 3D 창 배치를 오른쪽 -> 왼쪽 -> 부동 창으로 순환.
- 게임이 있는 모니터의 작업영역을 읽어 뷰어 창 크기와 위치를 계산.
- 남는 공간이 있으면 게임 창 옆에 배치, 없으면 같은 모니터의 가장자리에
  부동 창으로 표시. OXCE 원래 창 위치, 크기, 전투 입력은 변경하지 않음.
- 배치 모드는 격리 실행 폴더 R148S10_VIEW_LAYOUT.json에만 저장.
- 800ms 키 반복 억제와 기존 viewer 중복 실행 금지.
- Windows S2 DirectInput mouse/keyboard protection 기록 확인 후에만 표시.
- 사용자 전경 창 강제 전환, 커서 이동, 마우스/키보드 주입 없음.
- 원본 LOFT 3D 지형, PCK 4영역 대표색, F11 63본 스키닝,
  R148의 413개 누적 컴파일 오브젝트 그대로 계승.

## 실행
START_XPZ3D_R148S10_3D.cmd 파일을 더블클릭합니다.
전술 전투에서 Ctrl+Alt+F10과 Ctrl+Alt+F9를 사용합니다.
3D 뷰어는 별도의 S2 창에서 실행됩니다.

주의: 게임이 모니터 전체를 점유하면 부동 3D 창이 게임의 일부를
가릴 수 있습니다. 게임 창 자체를 3D로 교체하거나 OXCE 창을 축소
하는 기능은 아닙니다. 원본 저장파일은 수정되지 않습니다.

## 개발 한계
네이티브 게임 EXE 컴파일·링크와 패키지 생성이 성공하더라도 실제
Windows 사용자 세션에서 3D 프레임 표시와 단축키 동작이 보증되지는
않습니다. PCK 픽셀별 정밀 UV와 통합 게임 내부 D3D는 아직 미구현.
"""
save(ROOT/"README_R148S10_KO.md",readme)
save(STAGE/"README_R148S10_KO.md",readme)
receipt={
    "schema":"xpz3d.r148s10.docked_native_3d_viewer/v1",
    "version":"R148S10",
    "oxce_parent":"R148 cumulative 413-member archive, R148S9 companion",
    "oxce_exe":str(OX),"oxce_sha256":new_sha,"oxce_size":OX.stat().st_size,
    "s2_exe":str(S2),"s2_sha256":s2_sha,"s2_rebuilt":False,
    "hotkey_visibility":"Ctrl+Alt+F10",
    "hotkey_layout":"Ctrl+Alt+F9",
    "layout_modes":["right","left","float"],
    "same_window_3d":False,
    "mouse_keyboard_safety":"R23R directinput block unchanged; safe no-activate positioning",
    "original_saves_modified":False,
    "native_oxce_compiled":True,
    "live_gameplay_verified":False
}
save(ROOT/"R148S10_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))
save(STAGE/"R148S10_BUILD_RECEIPT.json",json.dumps(receipt,ensure_ascii=False,indent=2))

def package(dest,files):
    with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        used=set()
        for file,name in files:
            if not file.is_file():raise FileNotFoundError(str(file))
            if name in used:continue
            used.add(name)
            archive.write(file,arcname=str(name))
    print("R148S10_PACKAGE",dest,"BYTES",dest.stat().st_size,"SHA256",sha(dest),flush=True)

runtime=[(file,file.relative_to(ROOT)) for file in STAGE.rglob("*")
         if file.is_file() and not file.name.lower().endswith((".log",".bak",".tmp"))]
runtime.extend((ROOT/name,Path(name)) for name in (
    "START_XPZ3D_R148S10_3D.cmd","TOGGLE_XPZ3D_FROM_GAME.ps1","DOCK_XPZ3D_FROM_GAME.ps1"))
package(ROOT/"XPZ3D_R148S10_DOCKED_PAIRED_20261119.zip",runtime)
source=[(file,file.relative_to(ROOT)) for file in (ROOT/"oxce").glob("*")
        if file.is_file() and file.suffix.lower() in (".h",".cpp")]
source.extend((ROOT/name,Path(name)) for name in (
    "build_r148s10.ps1","package_r148s10.py","XPZ3D_WINDOW_CONTROL.ps1",
    "XPZ3D_INBATTLE_CONTROLLER.ps1","TOGGLE_XPZ3D_FROM_GAME.ps1",
    "DOCK_XPZ3D_FROM_GAME.ps1","README_R148S10_KO.md","R148S10_BUILD_RECEIPT.json"))
source.append((OX,Path("bin")/OX.name))
package(ROOT/"XPZ3D_R148S10_DOCKED_SOURCE_EXE_20261119.zip",source)
