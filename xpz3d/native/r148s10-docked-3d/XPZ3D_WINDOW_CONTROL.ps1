param(
    [ValidateSet('Show','Hide','Toggle','Cycle')][string]$Action='Toggle',
    [int]$S2Pid=0
)
# R148S10 native window controller. Moves ONLY the mouse-sealed S2 visual
# viewer, never alters the OXCE window, desktop foreground, cursor, or saves.
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
$expected=Join-Path $stage 's2-native\Game-r148s7-pck-XPZ3D-IGScene.exe'
$gameExe=Join-Path $stage 'oxce-runtime\openxcom.exe'
$runtime='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage35-r23p-live-private-runtime-20261107\runtime'
$gate=Join-Path $runtime '_xpz_r23r_no_mouse_gate.log'
$mouse=Join-Path $runtime '_xpz33_passive_mouse.log'
$receipt=Join-Path $stage 'R148S10_WINDOW_LAYOUT_RECEIPT.json'
$stateFile=Join-Path $stage 'R148S10_VIEW_LAYOUT.json'
$session=[System.Diagnostics.Process]::GetCurrentProcess().SessionId
if($session -lt 1){throw 'R148S10_REQUIRES_INTERACTIVE_DESKTOP_SESSION'}
if(!(Test-Path -LiteralPath $expected)){throw 'R148S10_NATIVE_S2_BINARY_MISSING'}
$found=@(Get-CimInstance Win32_Process -Filter "name='Game-r148s7-pck-XPZ3D-IGScene.exe'" -ErrorAction Stop |
    Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $expected})
if($S2Pid -gt 0){$found=@($found|Where-Object {$_.ProcessId -eq $S2Pid})}
if($found.Count -ne 1){throw ('R148S10_EXPECTED_ONE_S2_FOUND_'+$found.Count)}
$pidFound=[int]$found[0].ProcessId
if(!(Test-Path -LiteralPath $gate) -or !(Test-Path -LiteralPath $mouse)){
    throw 'R148S10_MOUSE_SAFE_STARTUP_LOGS_MISSING'
}
$passive=@(Get-Content -LiteralPath $gate -Tail 220 -ErrorAction Stop |
    Where-Object {$_ -match ('decision=allow_hidden_passive pid='+$pidFound+'(\s|$)')})
$sealed=@(Get-Content -LiteralPath $mouse -Tail 220 -ErrorAction Stop |
    Where-Object {$_ -match ('phase=directinput_skipped_mouse_keyboard_gamepads pid='+$pidFound+'(\s|$)')})
if($passive.Count -lt 1 -or $sealed.Count -lt 1){
    throw 'R148S10_REFUSE_UNSEALED_S2_PROCESS'
}
if(!('XPZ3DWindowDockR148S10' -as [type])){
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XPZ3DWindowDockR148S10 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left,Top,Right,Bottom; }
    public delegate bool EnumWindowCallback(IntPtr hwnd,IntPtr state);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowCallback cb,IntPtr state);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint cmd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT bounds);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT clip);
    public static IntPtr WindowForPid(uint pid) {
        IntPtr chosen=IntPtr.Zero;
        long area=0;
        EnumWindows((hwnd,state)=>{
            uint owner=0;GetWindowThreadProcessId(hwnd,out owner);
            if(owner!=pid || GetWindow(hwnd,4)!=IntPtr.Zero)return true;
            RECT bounds;
            if(!GetWindowRect(hwnd,out bounds))return true;
            long width=(long)bounds.Right-bounds.Left;
            long height=(long)bounds.Bottom-bounds.Top;
            long size=width*height;
            if(width>=200 && height>=150 && size>area){
                chosen=hwnd;area=size;
            }
            return true;
        },IntPtr.Zero);
        return chosen;
    }
}
'@ -ErrorAction Stop
}
$win=[XPZ3DWindowDockR148S10]::WindowForPid([uint32]$pidFound)
for($i=0;$win -eq [IntPtr]::Zero -and $i -lt 32;++$i){
    Start-Sleep -Milliseconds 250
    $win=[XPZ3DWindowDockR148S10]::WindowForPid([uint32]$pidFound)
}
if($win -eq [IntPtr]::Zero){throw 'R148S10_S2_TOP_LEVEL_WINDOW_MISSING'}
$oxce=@(Get-CimInstance Win32_Process -Filter "name='openxcom.exe'" -ErrorAction SilentlyContinue |
    Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $gameExe})
$gameWin=[IntPtr]::Zero
if($oxce.Count -eq 1){
    $gameWin=[XPZ3DWindowDockR148S10]::WindowForPid([uint32]$oxce[0].ProcessId)
}
$mode='right'
if(Test-Path -LiteralPath $stateFile){
    try{
        $saved=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        if($saved.mode -in @('right','left','float')){$mode=$saved.mode}
    }catch{$mode='right'}
}
if($Action -eq 'Cycle'){
    switch($mode){'right'{$mode='left'} 'left'{$mode='float'} default{$mode='right'}}
    @{schema='xpz3d.r148s10.view_layout/v1';mode=$mode} |
        ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
}
$beforeVisible=[XPZ3DWindowDockR148S10]::IsWindowVisible($win)
$beforeFocus=[XPZ3DWindowDockR148S10]::GetForegroundWindow()
$clip0=New-Object XPZ3DWindowDockR148S10+RECT
[void][XPZ3DWindowDockR148S10]::GetClipCursor([ref]$clip0)
$wantedVisible=$true
if($Action -eq 'Hide'){$wantedVisible=$false}
if($Action -eq 'Toggle'){$wantedVisible=!$beforeVisible}
$changed=$true
$position=[ordered]@{x=$null;y=$null;width=$null;height=$null}
if(!$wantedVisible){
    [void][XPZ3DWindowDockR148S10]::ShowWindow($win,0) # SW_HIDE
}else{
    Add-Type -AssemblyName System.Windows.Forms
    $sourceHandle=if($gameWin -ne [IntPtr]::Zero){$gameWin}else{$win}
    $area=[System.Windows.Forms.Screen]::FromHandle($sourceHandle).WorkingArea
    $w=[Math]::Min([Math]::Max(320,[int]($area.Width*0.43)),[Math]::Min(820,$area.Width-24))
    $h=[Math]::Min([Math]::Max(250,[int]($area.Height*0.70)),[Math]::Max(250,$area.Height-24))
    if($mode -eq 'float'){
        $w=[Math]::Min([Math]::Max(320,[int]($area.Width*0.37)),[Math]::Min(660,$area.Width-24))
        $h=[Math]::Min([Math]::Max(240,[int]($area.Height*0.54)),[Math]::Max(530,$area.Height-24))
    }
    $gameRect=New-Object XPZ3DWindowDockR148S10+RECT
    $hasGame=($gameWin -ne [IntPtr]::Zero -and
              [XPZ3DWindowDockR148S10]::GetWindowRect($gameWin,[ref]$gameRect))
    $x=if($mode -eq 'left'){$area.Left+12}else{$area.Right-$w-12}
    $y=$area.Top+32
    if($hasGame){
        $gameHeight=[Math]::Max(1,$gameRect.Bottom-$gameRect.Top)
        $y=[Math]::Min([Math]::Max($area.Top+12,$gameRect.Top+18),$area.Bottom-$h-12)
        if($mode -eq 'right' -and $area.Right-$gameRect.Right -ge $w+18){
            $x=$gameRect.Right+12
        }elseif($mode -eq 'left' -and $gameRect.Left-$area.Left -ge $w+18){
            $x=$gameRect.Left-$w-12
        }
    }
    $x=[Math]::Max($area.Left+6,[Math]::Min($x,$area.Right-$w-6))
    $y=[Math]::Max($area.Top+6,[Math]::Min($y,$area.Bottom-$h-6))
    # SW_SHOWNOACTIVATE then HWND_TOP + SWP_NOACTIVATE|SWP_SHOWWINDOW.
    # Never activate OXCE or the viewer, never modify OXCE's window bounds.
    [void][XPZ3DWindowDockR148S10]::ShowWindow($win,4)
    $changed=[XPZ3DWindowDockR148S10]::SetWindowPos(
        $win,[IntPtr]::Zero,$x,$y,$w,$h,[uint32]0x0050)
    $position=[ordered]@{x=$x;y=$y;width=$w;height=$h}
}
$afterVisible=[XPZ3DWindowDockR148S10]::IsWindowVisible($win)
$afterFocus=[XPZ3DWindowDockR148S10]::GetForegroundWindow()
$clip1=New-Object XPZ3DWindowDockR148S10+RECT
[void][XPZ3DWindowDockR148S10]::GetClipCursor([ref]$clip1)
$clipStable=($clip0.Left -eq $clip1.Left -and $clip0.Top -eq $clip1.Top -and
             $clip0.Right -eq $clip1.Right -and $clip0.Bottom -eq $clip1.Bottom)
$focusStable=($beforeFocus -eq $afterFocus)
$result=[ordered]@{
 schema='xpz3d.r148s10.docked_visible_native_s2/v1'
 viewerPid=$pidFound
 session=$session
 action=$Action
 layout=$mode
 wasVisible=$beforeVisible
 isVisible=$afterVisible
 layoutPosition=$position
 oxceFound=$hasGame
 showOrDockSucceeded=[bool]$changed
 foregroundUnchanged=[bool]$focusStable
 cursorClipUnchanged=[bool]$clipStable
 sealedMouseGateObserved=$true
 directInputSkippedObserved=$true
 originalSaveTouched=$false
 live3DSceneVerified=$false
}
$result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $receipt -Encoding UTF8
$result|ConvertTo-Json -Depth 5
if(!$changed -or $afterVisible -ne $wantedVisible){
    throw 'R148S10_WINDOW_VISIBILITY_OR_POSITION_CHANGE_FAILED'
}
if(!$clipStable -or !$focusStable){
    Write-Warning 'R148S10 detected an external desktop focus/clip change'
}
