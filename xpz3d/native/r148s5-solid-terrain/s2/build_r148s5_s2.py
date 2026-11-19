"""r24-EH: Compile S2 camera consumer and relink the SAME native S2 renderer.
No OpenXcom renderer or pixels are copied. All outputs stay under this stage.
The original r24-DY lib and Game.exe remain byte-for-byte unchanged.
"""
from pathlib import Path
import os
import sys
import subprocess
import hashlib
import json
import xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
SHARED=Path(r"D:\daphne_auto")
ROOT=SHARED/"XPZ3D_ENGINE_BUILD_20261102"
S2=ROOT/"stage35-r23l-real-terrain-qa-isolated-20261107"
AC=ROOT/"stage36-r24ac-mission-flip-capture-20261110"
V=ROOT/"stage36-r24v-source-curved-mesh-normals-20261109"
R23T=ROOT/"stage35-r23t-f11-contact-aware-20261107"
CERT=ROOT/"stage35-r23o-runtime-pair-cert-20261107"
DY=SHARED/"stage36-r24dy-live-original-actors-20261114-gpt6"/"native"
MD=ROOT/"stage36-r24av-native-oxce-unit-bridge-20261110"/"native-link-metadata"
VCVARS=ROOT/"vs2022-buildtools"/"VC"/"Auxiliary"/"Build"/"vcvars32.bat"
EXE=HERE/"Game-r148s5-solid-XPZ3D-IGScene.exe"
SOURCE=HERE/"iMissionBase-r136.cpp"
OBJ=HERE/"iMissionBase-r148s5-solid.obj"
BASE=DY/"Main-r24dy-source-live-actors.lib"
REMOVED=HERE/"Main-r148s5-solid-removed.lib"
MAIN=HERE/"Main-r148s5-solid.lib"
START={"creationflags":getattr(subprocess,"CREATE_NO_WINDOW",0)}
if os.name=="nt":
    si=subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow=0
    START["startupinfo"]=si

def run(*args,cwd=HERE,timeout=150):
    p=subprocess.run(args,cwd=str(cwd),text=True,capture_output=True,
                     errors="replace",timeout=timeout,**START)
    out=(p.stdout or "")+"\n"+(p.stderr or "")
    print("COMMAND",args[0],str(args[1]) if len(args)>1 else "",
          "EXIT",p.returncode,out[-4200:].encode("ascii","backslashreplace").decode("ascii"),flush=True)
    if p.returncode: raise RuntimeError(str(args[0])+" failed: "+out[-3500:])
    return out

def msvc_env():
    if not VCVARS.is_file(): raise RuntimeError("VS x86 environment script not installed")
    p=subprocess.run(["cmd.exe","/d","/q","/c",
             'call '+str(VCVARS)+' >nul && set'],cwd=str(HERE),
             text=True,capture_output=True,errors="replace",timeout=60,**START)
    if p.returncode:raise RuntimeError("No native x86 MSVC environment: "+(p.stderr or "")[-2000:])
    # cmd / SET returns the complete MSVC environment. Never merge case-
    # differing Path/PATH keys: CreateProcess can pick the stale one.
    env={}
    for line in p.stdout.splitlines():
        if "=" in line and not line.startswith("="):
            key,_,val=line.partition("=")
            env["PATH" if key.lower()=="path" else key]=val
    import shutil
    print("MSVC_CL",shutil.which("cl.exe",path=env.get("PATH","")),flush=True)
    if not shutil.which("cl.exe",path=env.get("PATH","")):
        raise RuntimeError("vcvars32 did not expose cl.exe")
    return env

def run_native(env,*cmd,timeout=150,cwd=HERE):
    import shutil
    # Windows CreateProcess searches the parent PATH for unqualified EXEs,
    # not necessarily the environment block passed to the new process.
    exe=shutil.which(cmd[0],path=env.get("PATH",""))
    if exe is None: raise RuntimeError("MSVC tool not on initialized PATH: "+cmd[0])
    p=subprocess.run([exe]+list(cmd[1:]),env=env,cwd=str(cwd),text=True,
                     capture_output=True,errors="replace",timeout=timeout,**START)
    body=(p.stdout or "")+"\n"+(p.stderr or "")
    print("NATIVE",cmd[0],"EXIT",p.returncode,
          body[-4400:].encode("ascii","backslashreplace").decode("ascii"),flush=True)
    if p.returncode:raise RuntimeError("Native command exit "+str(p.returncode)+":\n"+body[-3800:])
    return body

def compile(env):
    inc=[HERE,AC,V/"engine-overlay",R23T,R23T/"engine-overlay",
         CERT/"engine-overlay",S2/"engine-source"/"Main",
         S2/"build-engine-win32"/"rc_compat",
         S2/"engine-source"/"third_party"/"fmod"/"include",
         S2/"engine-source"/"third_party"/"lifestudio"/"include",
         S2/"engine-source"/"third_party"/"bink"/"include"]
    flags=["cl.exe","/nologo","/c","/O2","/Gr","/MD","/EHsc",
           "/std:c++14","/DWIN32","/D_WINDOWS","/DNDEBUG",
           "/DexternA5=extern","/DXPZ3D_COARSE_NAV_GRID",
           "/DCMAKE_INTDIR=Release"]+[v for p in inc for v in ("/I",str(p))]
    flags += ["/Fo:"+str(OBJ),str(SOURCE)]
    return run_native(env,*flags,timeout=200)

def archive(env):
    if not BASE.is_file():raise RuntimeError("Missing source actor S2 native archive")
    # Remove the old mission implementation; keep all other actual S2
    # renderer, 3D rig, collision and unit objects unchanged.
    member=DY/"iMissionBase-r24dy.obj"
    if not member.is_file():raise RuntimeError("Missing old compiled scene object")
    run_native(env,"lib.exe","/NOLOGO","/OUT:"+str(REMOVED),
               "/REMOVE:"+str(member),str(BASE))
    run_native(env,"lib.exe","/NOLOGO","/OUT:"+str(MAIN),str(REMOVED),str(OBJ))
    if MAIN.stat().st_size<40_000_000:raise RuntimeError("Unexpectedly small S2 archive")

def link(env):
    project=MD/"Game.vcxproj"
    doc=ET.parse(project).getroot()
    deps=None
    for group in doc.iter():
        if not group.tag.endswith("ItemDefinitionGroup") or \
           "Release|Win32" not in group.attrib.get("Condition","").replace(" ",""):
            continue
        for item in group:
            if not item.tag.endswith("Link"): continue
            for child in item:
                if child.tag.endswith("AdditionalDependencies"):
                    deps=[x.strip() for x in (child.text or "").split(";") if x.strip()]
    if not deps:raise RuntimeError("Missing S2 native link dependencies")
    slots=[i for i,s in enumerate(deps)
           if s.lower().replace("\\","/")=="/wholearchive:release/main.lib"]
    if len(slots)!=1:raise RuntimeError("S2 source Main.lib entry is ambiguous")
    deps[slots[0]]="/WHOLEARCHIVE:"+str(MAIN)
    support=[ROOT/"stage35-r23r-no-mouse-safe-run-20261107"/"engine-overlay"/x
             for x in ("Main.obj","WinFrame.obj")]
    support += [V/"engine-overlay"/x for x in ("GameStdAfx.obj","XPZVisualFeed.obj")]
    res=MD/"Game.dir"/"Release"/"Game.res"
    if not all(p.is_file() for p in support+[res]):raise RuntimeError("S2 renderer support files missing")
    cmd=["link.exe","/NOLOGO","/INCREMENTAL:NO","/MACHINE:X86",
         "/SUBSYSTEM:WINDOWS","/LARGEADDRESSAWARE","/DYNAMICBASE",
         "/NXCOMPAT","/MANIFEST","/MAP:"+str(HERE/"Game-r148s5-solid.map"),
         "/PDB:"+str(HERE/"Game-r148s5-solid.pdb"),
         "/OUT:"+str(EXE),"/IMPLIB:"+str(HERE/"Game-r148s5-solid.lib"),
         "/LIBPATH:"+str(MD/"_implibs"),"/LIBPATH:"+str(MD/"_implibs"/"Release")]
    # Resolve MSVC linker explicitly. The host PATH also contains GNU `link`
    # (coreutils), which misinterprets /MACHINE:X86 and must never be used.
    msvc_link=Path(env.get("VCToolsInstallDir",""))/"bin"/"HostX86"/"x86"/"link.exe"
    if not msvc_link.is_file():
        raise RuntimeError("Missing explicit MSVC x86 link.exe: "+str(msvc_link))
    cmd[0]=str(msvc_link)
    run_native(env,*(cmd+deps+[str(res)]+list(map(str,support))),cwd=MD,timeout=200)
    blob=EXE.read_bytes()
    if blob[:2]!=b"MZ":raise RuntimeError("No PE executable")
    markers=[b"XPZ3D_OXCE_LIVE_CAMERA_R135",
             b"XPZ3D_STAGE36_R24AP_REAL_S2_CAMERA_CENTER",
             b"r24ao_native_s2_vb_budget_expanded",
             b"r24av_oxce_native_unit_bridge",
             b"XPZ36AC_REAL_GAME_CM_RENDERFRAME_NGFX_FLIP_CAPTURE_PUBLISHED"]
    missing=[m.decode("ascii") for m in markers if m not in blob]
    if missing:raise RuntimeError("S2 renderer identity not carried: "+repr(missing))
    sha=hashlib.sha256(blob).hexdigest()
    receipt={"schema":"xpz3d.stage36.r148s5.reset_r136_terrain_solid_actors/v1",
        "game":str(EXE),"sha256":sha,"size":len(blob),
        "source":str(SOURCE),"base_archive":str(BASE),
        "renderer":"actual XPZ3D S2 IGScene, same Gfx modules and native actors",
        "camera_protocol":"Local\\XPZ3D_OXCE_LIVE_CAMERA_R135",
        "video_frame_exchange":False,
        "original_oxce_voxel_collision_authoritative":True,
        "s2_polygon_collision_promoted_to_oxce":False,
        "voxel_overlay_implementation":"reserved data fields, not yet rendered",
        "live_qa":False,"existing_s2_binaries_modified":False}
    (HERE/"R148S5_S2_BUILD_RECEIPT.json").write_text(
        json.dumps(receipt,indent=2,ensure_ascii=False),encoding="utf-8")
    print("R137_RESET_NATIVE_S2_RENDERER_LINKED",str(EXE),len(blob),sha,flush=True)

def main():
    op=sys.argv[1] if len(sys.argv)>1 else "all"
    if op not in ("compile","archive","link","all"):raise SystemExit("unknown stage")
    env=msvc_env()
    if op in ("compile","all"):compile(env)
    if op in ("archive","all"):archive(env)
    if op in ("link","all"):link(env)
if __name__=="__main__": main()
