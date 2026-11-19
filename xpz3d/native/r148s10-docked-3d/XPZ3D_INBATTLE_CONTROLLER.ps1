param([ValidateSet('Toggle','Cycle')][string]$Request='Toggle')
# Called by OXCE tactical hotkeys. A named mutex prevents two launchers from
# racing over the same exact-path sealed S2 viewer. No save or game input edits.
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
$run=Join-Path $stage 'RUN_R148S10_3D_PAIR.ps1'
$windowControl=Join-Path $stage 'XPZ3D_WINDOW_CONTROL.ps1'
$log=Join-Path $stage 'R148S10_INBATTLE_REQUESTS.log'
$mutex=New-Object System.Threading.Mutex($false,'Local\XPZ3D_R148S10_DOCK_VIEW_CONTROL')
$locked=$false
try{
    $locked=$mutex.WaitOne(0)
    if(!$locked){return}
    $session=[Diagnostics.Process]::GetCurrentProcess().SessionId
    if($session -lt 1){throw 'XPZ3D needs interactive desktop'}
    $expected=Join-Path $stage 's2-native\Game-r148s7-pck-XPZ3D-IGScene.exe'
    if(!(Test-Path -LiteralPath $expected)){throw 'R148S10 exact native viewer missing'}
    $existing=@(Get-CimInstance Win32_Process -Filter "name='Game-r148s7-pck-XPZ3D-IGScene.exe'" -ErrorAction Stop |
        Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $expected})
    if($existing.Count -gt 1){throw 'R148S10 viewer process ambiguous'}
    if($existing.Count -eq 0){
        if(!(Test-Path -LiteralPath $run)){throw 'R148S10 isolated S2 launcher missing'}
        & $run -Mode s2
        if(!$?){throw 'R148S10 safe S2 launcher reported an error'}
        $status='sealed_s2_started'
        if($Request -eq 'Cycle'){
            $now=@(Get-CimInstance Win32_Process -Filter "name='Game-r148s7-pck-XPZ3D-IGScene.exe'" -ErrorAction Stop |
                Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $expected})
            if($now.Count -eq 1){& $windowControl -Action Cycle -S2Pid $now[0].ProcessId}
        }
    }else{
        if(!(Test-Path -LiteralPath $windowControl)){throw 'R148S10 window controller missing'}
        & $windowControl -Action $Request -S2Pid $existing[0].ProcessId
        $status='existing_s2_'+$Request.ToLowerInvariant()
    }
    [IO.File]::AppendAllText($log,'['+(Get-Date).ToString('o')+'] '+$status+[Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
}catch{
    [IO.File]::AppendAllText($log,'['+(Get-Date).ToString('o')+'] FAILED '+[string]$_+[Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
    throw
}finally{
    if($locked){$mutex.ReleaseMutex()}
    $mutex.Dispose()
}
