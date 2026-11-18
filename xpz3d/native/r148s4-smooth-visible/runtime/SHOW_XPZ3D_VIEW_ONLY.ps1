param([int]$S2Pid=0)
$ErrorActionPreference='Stop'
# R148S3 VIEWFIX: reveal only an already mouse-sealed, hidden S2 window.
# Does NOT call SetForegroundWindow, ClipCursor, SetCursorPos, keyboard
# injection, DirectInput, or any OXCE save/game APIs.
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
$expected=Join-Path $stage 's2-native\Game-r148s4-smooth-XPZ3D-IGScene.exe'
$runtime='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage35-r23p-live-private-runtime-20261107\runtime'
$gate=Join-Path $runtime '_xpz_r23r_no_mouse_gate.log'
$mouse=Join-Path $runtime '_xpz33_passive_mouse.log'
$session=[System.Diagnostics.Process]::GetCurrentProcess().SessionId
if($session -lt 1){throw 'VIEWFIX_REQUIRES_INTERACTIVE_DESKTOP_SESSION'}
if(!(Test-Path -LiteralPath $expected)){throw 'VIEWFIX_S2_EXECUTABLE_MISSING'}
$matches=@(Get-CimInstance Win32_Process -Filter "name='Game-r148s4-smooth-XPZ3D-IGScene.exe'" -ErrorAction Stop |
 Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $expected})
if($S2Pid -gt 0){$matches=@($matches|Where-Object {$_.ProcessId -eq $S2Pid})}
if($matches.Count -ne 1){throw ('VIEWFIX_EXPECTED_ONE_ISOLATED_S2_PROCESS_FOUND_'+$matches.Count)}
$target=[int]$matches[0].ProcessId
if(!(Test-Path -LiteralPath $gate) -or !(Test-Path -LiteralPath $mouse)){throw 'VIEWFIX_MOUSE_SAFETY_LOGS_MISSING'}
# The launched S2 executable enforces these conditions at WinMain BEFORE
# it creates any windows or calls DirectInput.
$recentGate=@(Get-Content -LiteralPath $gate -Tail 150 -ErrorAction Stop |
 Where-Object {$_ -match ('decision=allow_hidden_passive pid='+$target+'(\s|$)')})
$recentMouse=@(Get-Content -LiteralPath $mouse -Tail 150 -ErrorAction Stop |
 Where-Object {$_ -match ('phase=directinput_skipped_mouse_keyboard_gamepads pid='+$target+'(\s|$)')})
if($recentGate.Count -lt 1 -or $recentMouse.Count -lt 1){
 throw 'VIEWFIX_REFUSED_NO_PROOF_OF_PASSIVE_MOUSE_INPUT_SEAL'
}
if(!('XPZ3DViewOnlyWindow' -as [type])){
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class XPZ3DViewOnlyWindow {
 [StructLayout(LayoutKind.Sequential)]
 public struct RECT {public int Left,Top,Right,Bottom;}
 public delegate bool EnumWindowProc(IntPtr hwnd,IntPtr param);
 [DllImport("user32.dll",SetLastError=true)]
 public static extern bool EnumWindows(EnumWindowProc callback,IntPtr param);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr insertAfter,int x,int y,int cx,int cy,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT r);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
 public static IntPtr FindWindowForPid(uint pid) {
   IntPtr chosen=IntPtr.Zero;long maxArea=0;
   EnumWindows((hwnd,unused)=>{
     uint owner=0;GetWindowThreadProcessId(hwnd,out owner);
     if(owner!=pid || GetWindow(hwnd,4)!=IntPtr.Zero)return true;
     RECT r;
     if(!GetWindowRect(hwnd,out r))return true;
     long width=(long)r.Right-r.Left,height=(long)r.Bottom-r.Top;
     if(width<200 || height<150)return true;
     long area=width*height;
     if(area>maxArea){maxArea=area;chosen=hwnd;}
     return true;
   },IntPtr.Zero);
   return chosen;
 }
 public static bool RevealWithoutFocus(IntPtr hwnd) {
   RECT r;
   if(!GetWindowRect(hwnd,out r))return false;
   int width=Math.Max(200,r.Right-r.Left);
   int screen=GetSystemMetrics(0);
   int x=Math.Max(24,screen-width-32);
   ShowWindow(hwnd,4); // SW_SHOWNOACTIVATE: no foreground activation
   // SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW; no cursor APIs.
   return SetWindowPos(hwnd,IntPtr.Zero,x,48,0,0,0x0051);
 }
}
'@ -ErrorAction Stop
}
$handle=[XPZ3DViewOnlyWindow]::FindWindowForPid([uint32]$target)
for($attempt=0;$handle -eq [IntPtr]::Zero -and $attempt -lt 32;++$attempt){
 Start-Sleep -Milliseconds 250
 $handle=[XPZ3DViewOnlyWindow]::FindWindowForPid([uint32]$target)
}
if($handle -eq [IntPtr]::Zero){throw 'VIEWFIX_S2_CREATED_NO_TOP_LEVEL_RENDER_WINDOW'}
$beforeVisible=[XPZ3DViewOnlyWindow]::IsWindowVisible($handle)
$beforeForeground=[XPZ3DViewOnlyWindow]::GetForegroundWindow()
$beforeClip=New-Object XPZ3DViewOnlyWindow+RECT
[void][XPZ3DViewOnlyWindow]::GetClipCursor([ref]$beforeClip)
$shown=[XPZ3DViewOnlyWindow]::RevealWithoutFocus($handle)
$afterVisible=[XPZ3DViewOnlyWindow]::IsWindowVisible($handle)
$afterForeground=[XPZ3DViewOnlyWindow]::GetForegroundWindow()
$afterClip=New-Object XPZ3DViewOnlyWindow+RECT
[void][XPZ3DViewOnlyWindow]::GetClipCursor([ref]$afterClip)
$clipUnchanged=($beforeClip.Left -eq $afterClip.Left -and
 $beforeClip.Top -eq $afterClip.Top -and
 $beforeClip.Right -eq $afterClip.Right -and
 $beforeClip.Bottom -eq $afterClip.Bottom)
$foregroundUnchanged=($beforeForeground -eq $afterForeground)
$record=[ordered]@{
 schema='xpz3d.r148s4.viewfix.sealed_mouse_window/v1'
 processId=$target
 desktopSession=$session
 hwnd=('0x{0:X}' -f $handle.ToInt64())
 wasVisible=$beforeVisible
 isVisible=$afterVisible
 setWindowPosSucceeded=[bool]$shown
 foregroundUnchanged=[bool]$foregroundUnchanged
 clipCursorUnchanged=[bool]$clipUnchanged
 sealedMouseGateObserved=$true
 directInputSkippedObserved=$true
 live3DSceneVerified=$false
 noKeyboardMouseInjection=$true
}
$receipt=Join-Path $stage 'R148S4_VIEWFIX_RECEIPT.json'
$record|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $receipt -Encoding UTF8
$record|ConvertTo-Json -Depth 4
if(!$shown -or !$afterVisible){throw 'VIEWFIX_WINDOW_REVEAL_FAILED'}
if(!$clipUnchanged -or !$foregroundUnchanged){
 Write-Warning 'VIEWFIX_MOUSE_OR_FOREGROUND_CHANGED_EXTERNALLY_CHECK_DESKTOP'
}
