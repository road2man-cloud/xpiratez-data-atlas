# Stage 22 isolated GOG smoke; never writes original saves or uploads purchased assets.
param(
    [string]$Runtime = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002',
    [string]$BuildExe = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-windowprobe-win32\Release\Game.exe',
    [int]$MaxHints = 14
)
$ErrorActionPreference = 'Stop'
$session = 's22' + [Guid]::NewGuid().ToString('N').Substring(0,18)
$evidence = Join-Path $Runtime "stage22-evidence-$session"
$exe = Join-Path $Runtime 'XPZ3D_Stage22.exe'
$inbox = Join-Path $Runtime '_harness_cmd.txt'
$ackLog = Join-Path $Runtime '_saveload.log'
$stackLog = Join-Path $Runtime '_xpz_interface_stack.log'
$worldLog = Join-Path $Runtime '_xpz_world_steps.log'
$nativeLog = Join-Path $Runtime '_xpz_native_units.log'
$script:sequence = 0
$gameProcess = $null
$runResult = 'FAIL'
$reason = 'not-started'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

function Log([string]$message) {
    $line = ('{0:O} {1}' -f (Get-Date), $message)
    $line | Out-File -Append -Encoding utf8 (Join-Path $evidence 'driver.log')
    Write-Output $line
}
function Read-Text([string]$file) {
    if (-not (Test-Path -LiteralPath $file)) { return '' }
    try { return [IO.File]::ReadAllText($file) } catch { return '' }
}
function Wait-For([scriptblock]$test,[int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        if (& $test) { return $true }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    return $false
}
function Send-Raw([int]$seq,[string]$sess,[string]$command) {
    if (Test-Path -LiteralPath $inbox) { throw "Inbox occupied, refusing overwrite: $inbox" }
    $temp = Join-Path $Runtime ("_harness_cmd.$session.tmp")
    [IO.File]::WriteAllText($temp,("seq $seq session $sess $command" + [Environment]::NewLine),[Text.Encoding]::ASCII)
    [IO.File]::Move($temp,$inbox)
}
function Send-Command([string]$command) {
    $script:sequence++
    $seq = $script:sequence
    Send-Raw $seq $session $command
    $ackPrefix = "[harness] ACK session=$session seq=$seq pid=$($gameProcess.Id) "
    if (-not (Wait-For { (Read-Text $ackLog).Contains($ackPrefix) } 10)) {
        throw "NO ACK seq=$seq cmd=$command (not retried)"
    }
    $dispatchPrefix = "[harness] DISPATCH session=$session seq=$seq "
    $failPrefix = "[harness] FAIL session=$session seq=$seq "
    if (-not (Wait-For {
        $text = Read-Text $ackLog
        $text.Contains($dispatchPrefix) -or $text.Contains($failPrefix)
    } 10)) { throw "NO DISPATCH/FAIL seq=$seq (not retried)" }
    if ((Read-Text $ackLog).Contains($failPrefix)) { throw "Engine FAIL seq=$seq cmd=$command" }
    Log "ACK+DISPATCH seq=$seq $command"
}
function Get-Top {
    $rows = @(((Read-Text $stackLog) -split '[\r\n]+') | Where-Object { $_ -match '^event=\S+ depth=\d+ top=' })
    if ($rows.Count -eq 0) { return '' }
    return [string]$rows[-1]
}
function Get-Pops {
    return @(((Read-Text $stackLog) -split '[\r\n]+') | Where-Object { $_ -match '^event=pop_interface ' }).Count
}
function Get-Segments {
    $ms = [regex]::Matches((Read-Text $worldLog),'event=world_segment count=(\d+)')
    if ($ms.Count -eq 0) { return 0 }
    return [int]$ms[$ms.Count-1].Groups[1].Value
}
function Get-WorldAdds {
    return @(((Read-Text $nativeLog) -split '[\r\n]+') | Where-Object { $_ -match '^event=world_add_completed ' })
}
function Assert-Addition([string]$row) {
    $m = [regex]::Match($row, 'world_before=(\d+) world_after=(\d+) player_before=(\d+) player_after=(\d+) actor_ptr=(\S+)')
    if (-not $m.Success) { throw "Invalid spawn log: $row" }
    if (([int]$m.Groups[2].Value) -ne ([int]$m.Groups[1].Value + 1) -or
        ([int]$m.Groups[4].Value) -ne ([int]$m.Groups[3].Value + 1)) {
        throw "Not +1 world/player: $row"
    }
    return [string]$m.Groups[5].Value
}

try {
    if (-not (Test-Path -LiteralPath $BuildExe)) { throw "Missing build: $BuildExe" }
    if (-not (Test-Path -LiteralPath (Join-Path $Runtime 'game.db'))) { throw 'Missing isolated GOG game.db' }
    $foreign = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -match '^(?i:Game|XPZ3D_.+)\.exe$' -and $_.ExecutablePath -like "$Runtime\*"
    })
    if ($foreign.Count -gt 0) { throw "Isolated runtime in use: $($foreign.ProcessId -join ',')" }
    foreach ($name in @('_harness_cmd.txt','_saveload.log','_console.log','_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log')) {
        $path = Join-Path $Runtime $name
        if (Test-Path -LiteralPath $path) {
            Move-Item -LiteralPath $path -Destination (Join-Path $evidence ("previous-"+$name)) -ErrorAction Stop
        }
    }
    Copy-Item -LiteralPath $BuildExe -Destination $exe -Force
    $engineHash = (Get-FileHash -Algorithm SHA256 $exe).Hash
    Log "BUILD_SHA256=$engineHash SESSION=$session"
    $env:XPZ3D_HARNESS_SESSION = $session
    $env:XPZ3D_FREE_MOUSE = '1'
    $env:XPZ3D_WINDOWED_SMOKE = '1'
    $env:XPZ3D_HINT_CLOSE_TEST = '1'
    $env:XPZ3D_TUTORIAL_SMOKE = '1'
    $env:XPZ3D_INTERFACE_STACK_DIAG = '1'
    $env:XPZ3D_WORLD_STEP_DIAG = '1'
    $env:XPZ3D_NATIVE_SPAWN_DIAG = '1'
    $env:XPZ3D_SPAWN_TEST_EVENT = '0'
    $gameProcess = Start-Process -FilePath $exe -WorkingDirectory $Runtime -ArgumentList @('-harness','-windowed','-nosound','-cfg','xpz-start-no-video.cfg') -PassThru
    Log "ENGINE_STARTED pid=$($gameProcess.Id) sessionId=$($gameProcess.SessionId)"
    $ready = "[harness] READY session=$session pid=$($gameProcess.Id)"
    if (-not (Wait-For { (Read-Text $ackLog).Contains($ready) } 75)) { throw 'NO READY: engine startup did not complete' }
    Log "ENGINE_READY pid=$($gameProcess.Id)"
    if (-not (Wait-For { (Get-Top) -match 'CMainMenuInterface' } 20)) { throw 'Main menu not active' }
    Send-Command 'console mainmenu'
    # Negative transport controls must be rejected before effectful dispatch.
    $last = $script:sequence
    Send-Raw $last $session 'console mainmenu'
    if (-not (Wait-For { (Read-Text $ackLog).Contains("[harness] DUPLICATE session=$session seq=$last ") } 8)) {
        throw 'Duplicate did not get rejected'
    }
    Log 'DUPLICATE_REJECTED'
    Send-Raw 99999 'wrong_session' 'console xpz3d_tutorial_smoke'
    if (-not (Wait-For { (Read-Text $ackLog).Contains('[harness] FAIL reason=stale-session') } 8)) {
        throw 'Stale-session request was not rejected'
    }
    Log 'STALE_SESSION_REJECTED'
    Send-Command 'console xpz3d_tutorial_smoke'
    if (-not (Wait-For { (Get-Top) -match 'CMission|CShowHintInterface' } 75)) {
        throw 'Tutorial mission not visible'
    }
    Log "TUTORIAL_ENTERED $(Get-Top)"
    # Do not mistake the initial pre-hint world frames for post-hint recovery.
    if (-not (Wait-For { (Get-Top) -match 'CShowHintInterface' } 40)) {
        throw 'First tutorial hint did not appear; post-hint proof unavailable'
    }
    Log "FIRST_HINT_VISIBLE $(Get-Top)"
    $worldReady = $false
    $dismissals = 0
    for ($round=0; $round -lt ($MaxHints + 12); $round++) {
        $top = Get-Top
        if ($top -match 'CShowHintInterface') {
            if ($dismissals -ge $MaxHints) { throw "Hint cap $MaxHints exceeded" }
            $before = Get-Pops
            Send-Command 'console xpz3d_dismiss_hint'
            if (-not (Wait-For { (Get-Pops) -gt $before } 8)) {
                throw 'Dismiss ACK returned but native Pop was not observed'
            }
            $dismissals++
            Log "HINT_POP_OK number=$dismissals top=$(Get-Top)"
            Start-Sleep -Milliseconds 650
            continue
        }
        if ($top -match 'CMission') {
            $pre = Get-Segments
            Start-Sleep -Seconds 3
            $post = Get-Segments
            $topNext = Get-Top
            if ($post -gt $pre -and $topNext -match 'CMission' -and $topNext -notmatch 'CShowHintInterface') {
                $worldReady = $true
                Log "WORLD_STEP_PASS before=$pre after=$post hints=$dismissals"
                break
            }
            Log "WORLD_NOT_YET_STABLE before=$pre after=$post top=$topNext"
        } else {
            Log "UNSUPPORTED_TOP $top"
            Start-Sleep -Seconds 1
        }
    }
    if (-not $worldReady) { throw 'Could not prove stable mission/world stepping' }
    $firstCount = @(Get-WorldAdds).Count
    Send-Command 'console summonunit 730'
    if (-not (Wait-For { @(Get-WorldAdds).Count -ge ($firstCount + 1) } 15)) {
        throw 'Summon returned but AddUnitInGame +1 was not observed'
    }
    $first = @(Get-WorldAdds)[$firstCount]
    $firstID = Assert-Addition $first
    Log "NATIVE_SPAWN_1_PASS actor=$firstID $first"
    Send-Command 'console summonunit 730'
    if (-not (Wait-For { @(Get-WorldAdds).Count -ge ($firstCount + 2) } 15)) {
        throw 'Second summon did not add exactly one unit'
    }
    $second = @(Get-WorldAdds)[$firstCount + 1]
    $secondID = Assert-Addition $second
    if ($firstID -eq $secondID) { throw 'Duplicate actor pointer' }
    Log "NATIVE_SPAWN_2_PASS actor=$secondID $second"
    $beforeInvalid = @(Get-WorldAdds).Count
    Send-Command 'console summonunit 999999'
    Start-Sleep -Seconds 3
    if (@(Get-WorldAdds).Count -ne $beforeInvalid) { throw 'Invalid ID inserted a unit' }
    Log 'INVALID_ID_NO_SPAWN_PASS'
    $runResult = 'NATIVE_SPAWN_PASS'
    $reason = 'Two +1 spawns and invalid ID negative control'
} catch {
    $reason = $_.Exception.Message
    Log "ERROR: $reason"
} finally {
    if ($gameProcess) {
        try {
            $gameProcess.Refresh()
            if (-not $gameProcess.HasExited) {
                try {
                    $script:sequence++
                    Send-Raw $script:sequence $session 'quit'
                    Log "QUIT_REQUEST_SENT seq=$script:sequence"
                } catch { Log "QUIT_REQUEST_UNAVAILABLE $($_.Exception.Message)" }
                if (-not $gameProcess.WaitForExit(6500)) {
                    Stop-Process -Id $gameProcess.Id -Force -ErrorAction SilentlyContinue
                    Log "OWN_ENGINE_TERMINATED pid=$($gameProcess.Id)"
                }
            }
        } catch { Log "OWN_ENGINE_CLEANUP_ERROR $($_.Exception.Message)" }
    }
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XPZ3DStage22Cursor {
    [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr rect);
}
'@ -ErrorAction Stop
        [XPZ3DStage22Cursor]::ClipCursor([IntPtr]::Zero) | Out-Null
        Log 'CURSOR_CLIP_RELEASED'
    } catch { Log "CURSOR_CLIP_RELEASE_FAILED $($_.Exception.Message)" }
    foreach ($name in @('_saveload.log','_console.log','_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log')) {
        $file = Join-Path $Runtime $name
        if (Test-Path -LiteralPath $file) {
            Copy-Item -LiteralPath $file -Destination (Join-Path $evidence $name) -Force
        }
    }
    Log "FINAL=$runResult reason=$reason"
    @("FINAL=$runResult","REASON=$reason","SESSION=$session") |
        Out-File -Encoding ASCII (Join-Path $evidence 'result.txt')
    Log "EVIDENCE=$evidence"
}
if ($runResult -ne 'NATIVE_SPAWN_PASS') { exit 1 }
