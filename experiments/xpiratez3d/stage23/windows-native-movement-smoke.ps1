# Stage 23 isolated GOG smoke; never writes original saves or uploads purchased assets.
param(
    [string]$Runtime = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002',
    [string]$BuildExe = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-windowprobe-win32\Release\Game.exe',
    [int]$MaxHints = 14,
    [switch]$TurnBased
)
$ErrorActionPreference = 'Stop'
$session = 's23' + [Guid]::NewGuid().ToString('N').Substring(0,18)
$evidence = Join-Path $Runtime "stage23-evidence-$session"
$exe = Join-Path $Runtime 'XPZ3D_Stage23.exe'
$inbox = Join-Path $Runtime '_harness_cmd.txt'
$ackLog = Join-Path $Runtime '_saveload.log'
$stackLog = Join-Path $Runtime '_xpz_interface_stack.log'
$worldLog = Join-Path $Runtime '_xpz_world_steps.log'
$nativeLog = Join-Path $Runtime '_xpz_native_units.log'
$moveLog = Join-Path $Runtime '_xpz_stage23_move.log'
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
    # File.ReadAllText uses FileShare.Read; concurrent polling can prevent the
    # native fopen("a") from writing the one-shot DISPATCH record.
    # Share reads/writes explicitly so evidence collection cannot block the engine.
    $fs = $null
    $reader = $null
    try {
        $fs = [IO.FileStream]::new(
            $file, [IO.FileMode]::Open, [IO.FileAccess]::Read,
            ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
        $reader = [IO.StreamReader]::new($fs)
        return $reader.ReadToEnd()
    } catch { return '' } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        elseif ($null -ne $fs) { $fs.Dispose() }
    }
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
    foreach ($name in @('_harness_cmd.txt','_saveload.log','_console.log','_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log','_xpz_stage23_move.log')) {
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
    $env:XPZ3D_MOVE_TEST = '1'
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
    # The same exact native-spawn gate as Stage 22, then select and move this unit.
    $firstCount = @(Get-WorldAdds).Count
    Send-Command 'console summonunit 730'
    if (-not (Wait-For { @(Get-WorldAdds).Count -eq ($firstCount + 1) } 15)) {
        throw 'Native spawned actor missing: actual AddUnitInGame not observed'
    }
    $add = @(Get-WorldAdds)[$firstCount]
    $actor = Assert-Addition $add
    Log "NATIVE_SPAWN_PASS actor=$actor $add"
    if ($TurnBased) {
        Send-Command 'console xpz3d_stage23 combat'
        if (-not (Wait-For { (Read-Text $moveLog).Contains('event=combat_requested ') } 8)) {
            throw 'Native start-combat command did not execute'
        }
        Log 'COMBAT_COMMAND_SUBMITTED'
        $turnReady = $false
        for ($attempt=0; $attempt -lt 40; $attempt++) {
            if ((Get-Top) -notmatch 'top=class NGame::CMission ') { Start-Sleep -Milliseconds 500; continue }
            Send-Command 'console xpz3d_stage23 status'
            $lines = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=probe mode=status ' })
            if ($lines.Count -gt 0) {
                $latest = [string]$lines[-1]
                Log "COMBAT_STATE $latest"
                if ($latest -match 'realtime=0 player_turn=1') { $turnReady = $true; break }
            }
            Start-Sleep -Milliseconds 500
        }
        if (-not $turnReady) { throw 'Could not prove active human turn in native turn-based combat' }
        Log 'TURN_BASED_PLAYER_TURN_PASS'
    }
    Send-Command 'console xpz3d_stage23 status'
    $snapRows = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=snapshot index=1 ' })
    if ($snapRows.Count -eq 0) { throw 'No native spawned-unit snapshot' }
    $baseline = [string]$snapRows[-1]
    $baselineMatch = [regex]::Match($baseline, 'unit=(\S+) tile=(\d+),(\d+) layer=(\d+).* ap=(-?\d+).* real=([-0-9.]+),([-0-9.]+),([-0-9.]+)')
    if (-not $baselineMatch.Success) { throw "Malformed native snapshot: $baseline" }
    $nativeActor = $baselineMatch.Groups[1].Value
    $beforeX = [int]$baselineMatch.Groups[2].Value
    $beforeY = [int]$baselineMatch.Groups[3].Value
    $beforeAP = [int]$baselineMatch.Groups[5].Value
    $beforeRealX = [double]::Parse($baselineMatch.Groups[6].Value,[Globalization.CultureInfo]::InvariantCulture)
    $beforeRealY = [double]::Parse($baselineMatch.Groups[7].Value,[Globalization.CultureInfo]::InvariantCulture)
    Log "NATIVE_UNIT_BASELINE ptr=$nativeActor tile=$beforeX,$beforeY real=$beforeRealX,$beforeRealY $baseline"
    # Negative control: find a non-passable destination and preflight it without submitting.
    # A mission with no nearby blocked tiles is recorded as not-tested, not PASS.
    Send-Command 'console xpz3d_stage23 blocked'
    $blocked = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=blocked_preflight ' })
    $refused = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=blocked_order_result ' })
    if ($blocked.Count -ne 1 -or $refused.Count -ne 1) { throw 'No exact blocked preflight and blocked order evidence' }
    if ([string]$blocked[-1] -notmatch 'passable=0 .*cando=8 .*submitted=0 ') {
        throw "Blocked tile did not yield native PATH_NOT_FOUND: $($blocked[-1])"
    }
    $b = [string]$refused[-1]
    if ($b -notmatch ([regex]::Escape("unit=$nativeActor ") + 'preview=8 result=8 same_tile=1 same_ap=1 same_path=1 path_before=0 path_after=0')) {
        throw "Blocked command not safely rejected: $b"
    }
    Start-Sleep -Milliseconds 550
    Send-Command 'console xpz3d_stage23 status'
    $bSnaps = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=snapshot index=1 ' })
    $bSnap = [string]$bSnaps[-1]
    $unchanged = [regex]::Match($bSnap, 'unit=(\S+) tile=(\d+),(\d+) layer=\d+.* ap=(-?\d+) selected=\d+ moving=(\d+) path=(\d+) real=([-0-9.]+),([-0-9.]+),([-0-9.]+)')
    if (-not $unchanged.Success -or $unchanged.Groups[1].Value -ne $nativeActor -or
        [int]$unchanged.Groups[2].Value -ne $beforeX -or [int]$unchanged.Groups[3].Value -ne $beforeY -or
        [int]$unchanged.Groups[4].Value -ne $beforeAP -or $unchanged.Groups[5].Value -ne '0' -or
        $unchanged.Groups[6].Value -ne '0') { throw "Rejected order caused position/AP/path drift: $bSnap" }
    $blockedRX = [double]::Parse($unchanged.Groups[7].Value,[Globalization.CultureInfo]::InvariantCulture)
    $blockedRY = [double]::Parse($unchanged.Groups[8].Value,[Globalization.CultureInfo]::InvariantCulture)
    if ([math]::Abs($blockedRX-$beforeRealX) -ge 0.03 -or [math]::Abs($blockedRY-$beforeRealY) -ge 0.03) {
        throw "Rejected order moved 3D position: $bSnap"
    }
    Log "BLOCKED_ORDER_REJECTED_PASS $b"
    Log "BLOCKED_ORDER_NO_DRIFT_PASS $bSnap"

    $preSegments = Get-Segments
    Send-Command 'console xpz3d_stage23 move'
    if (-not (Wait-For {
        $l = Read-Text $moveLog
        $l.Contains('event=move_submit ') -or $l.Contains('reason=no_eligible_destination mode=move')
    } 12)) { throw 'No native move submission or refusal log' }
    $submitRows = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=move_submit ' })
    if ($submitRows.Count -ne 1) { throw 'Native pathfinding did not submit exactly one move' }
    $submit = [string]$submitRows[-1]
    if ($submit -notmatch 'result=1 ' -or $submit -notmatch 'selected=1$') {
        throw "Move was not accepted / unit not selected: $submit"
    }
    Log "NATIVE_MOVE_SUBMIT $submit"
    $destinationMatch = [regex]::Match($submit, ' to=(\d+),(\d+) ')
    if (-not $destinationMatch.Success) { throw "Destination not recorded: $submit" }
    $destX = [int]$destinationMatch.Groups[1].Value
    $destY = [int]$destinationMatch.Groups[2].Value

    $arrived = $false
    $finishedPath = $false
    $changedTile = $false
    $lastAP = $beforeAP
    $changedReal = $false
    $observedPath = $false
    $samples = 0
    for ($i=0; $i -lt 24; $i++) {
        if ((Get-Top) -notmatch 'top=class NGame::CMission ') {
            throw "Mission modal interrupted move: $(Get-Top)"
        }
        Send-Command 'console xpz3d_stage23 status'
        $rows = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=snapshot index=1 ' })
        if ($rows.Count -eq 0) { throw 'No unit position evidence' }
        $line = [string]$rows[-1]
        $m = [regex]::Match($line,'unit=(\S+) tile=(\d+),(\d+) layer=(\d+).* ap=(-?\d+) selected=(\d+) moving=(\d+) path=(\d+) real=([-0-9.]+),([-0-9.]+),([-0-9.]+)')
        if (-not $m.Success) { throw "Malformed motion sample: $line" }
        if ($m.Groups[1].Value -ne $nativeActor) { throw "Spawn actor identity changed: $line" }
        $x = [int]$m.Groups[2].Value
        $y = [int]$m.Groups[3].Value
        $lastAP = [int]$m.Groups[5].Value
        $rx = [double]::Parse($m.Groups[9].Value,[Globalization.CultureInfo]::InvariantCulture)
        $ry = [double]::Parse($m.Groups[10].Value,[Globalization.CultureInfo]::InvariantCulture)
        $changedTile = $changedTile -or ($x -ne $beforeX) -or ($y -ne $beforeY)
        $arrived = $arrived -or ($x -eq $destX -and $y -eq $destY)
        $finishedPath = $finishedPath -or ($arrived -and $m.Groups[8].Value -eq '0')
        $changedReal = $changedReal -or ([math]::Sqrt(($rx-$beforeRealX)*($rx-$beforeRealX)+($ry-$beforeRealY)*($ry-$beforeRealY)) -ge 0.25)
        $observedPath = $observedPath -or ($m.Groups[7].Value -eq '1') -or ($m.Groups[8].Value -eq '1')
        $samples++
        Log "UNIT_MOTION_SAMPLE index=$i $line"
        if ($arrived -and $changedReal -and $finishedPath) { break }
        Start-Sleep -Milliseconds 600
    }
    # The world trace is intentionally throttled (one row per roughly 2s).
    # Wait for a new native segment record rather than comparing two adjacent reads.
    if (-not (Wait-For { (Get-Segments) -gt $preSegments } 8)) {
        throw "World segments did not progress during move: before=$preSegments after=$(Get-Segments)"
    }
    $postSegments = Get-Segments
    if (-not ($changedTile -and $changedReal -and $arrived -and $finishedPath)) {
        throw "Native motion incomplete: tile=$changedTile real=$changedReal arrived=$arrived completedPath=$finishedPath pathObserved=$observedPath samples=$samples"
    }
    # A target tile can update before the native movement animation settles.
    # Do not infer an animation finish from path=0 while moving=1.
    $animationSettled = $false
    for ($j=0; $j -lt 14; $j++) {
        Start-Sleep -Milliseconds 450
        Send-Command 'console xpz3d_stage23 status'
        $rows = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=snapshot index=1 ' })
        $tail = [string]$rows[-1]
        $last = [regex]::Match($tail, 'unit=(\S+) tile=(\d+),(\d+) layer=\d+.* moving=(\d+) path=(\d+)')
        if (-not $last.Success -or $last.Groups[1].Value -ne $nativeActor) { throw "Animation identity mismatch: $tail" }
        Log "ANIMATION_SAMPLE index=$j $tail"
        if ([int]$last.Groups[2].Value -eq $destX -and [int]$last.Groups[3].Value -eq $destY -and
            $last.Groups[4].Value -eq '0' -and $last.Groups[5].Value -eq '0') {
            $animationSettled = $true
            break
        }
    }
    if (-not $animationSettled) { throw 'Animation did not settle after arrival: moving=1 or path still active' }
    Log "NATIVE_ANIMATION_SETTLED_PASS actor=$nativeActor target=$destX,$destY"
    if ($TurnBased) {
        $afterRows = @(((Read-Text $moveLog) -split '[\r\n]+') | Where-Object { $_ -match 'event=snapshot index=1 ' })
        $apCheck = [regex]::Match(([string]$afterRows[-1]), ' ap=(\d+) ')
        if (-not $apCheck.Success) { throw 'Cannot verify turn-based AP' }
        $lastAP = [int]$apCheck.Groups[1].Value
        if ($lastAP -ge $beforeAP) { throw "Turn-based AP did not decrease from $beforeAP to $lastAP" }
        Log "TURN_BASED_AP_SPEND_PASS before=$beforeAP after=$lastAP cost=$($beforeAP-$lastAP)"
    } else {
        Log "REALTIME_AP_UNCHANGED_EXPECTED before=$beforeAP after=$lastAP (CDumbUnitServer::SpendAP skips realtime)"
    }
    Log "NATIVE_MOVEMENT_PASS actor=$nativeActor destination=$destX,$destY tile_changed=$changedTile real_changed=$changedReal arrived=$arrived finished_path=$finishedPath path_observed=$observedPath animation_settled=$animationSettled samples=$samples segments=$preSegments,$postSegments"
    $runResult = 'NATIVE_MOVEMENT_PASS'
    $reason = 'Native path command executed, reached target tile, rendered 3D position changed, world segments advanced'
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
public static class XPZ3DStage23Cursor {
    [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr rect);
}
'@ -ErrorAction Stop
        [XPZ3DStage23Cursor]::ClipCursor([IntPtr]::Zero) | Out-Null
        Log 'CURSOR_CLIP_RELEASED'
    } catch { Log "CURSOR_CLIP_RELEASE_FAILED $($_.Exception.Message)" }
    foreach ($name in @('_saveload.log','_console.log','_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log','_xpz_stage23_move.log')) {
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
if ($runResult -ne 'NATIVE_MOVEMENT_PASS') { exit 1 }
