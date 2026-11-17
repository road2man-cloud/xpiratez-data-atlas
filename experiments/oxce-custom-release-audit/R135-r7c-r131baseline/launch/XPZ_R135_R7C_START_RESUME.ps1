param([int]$StartupSeconds=35)
$ErrorActionPreference='Stop'
$game=Split-Path -Parent $MyInvocation.MyCommand.Path
$name='openxcom_R135_R7C_R131_BASELINE_CATEGORY_GROUPS_TEST.exe'
$exe=Join-Path $game $name
$expectedHash='092102A2DD5A9B7134CF47F9DD443B3BF046C5D8A1F3645A3471E6FBB1AFF107'
$logdir=Join-Path $game 'user\launch-diagnostics'
if(!(Test-Path $logdir)){New-Item -Path $logdir -ItemType Directory -Force|Out-Null}
$log=Join-Path $logdir ('r135-r7c-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.txt')
function Trace([string]$message) {Write-Host $message;Add-Content -LiteralPath $log -Value $message}
if(!(Test-Path $exe)){throw ('R135 EXE missing: '+$exe)}
if((Get-FileHash $exe -Algorithm SHA256).Hash -ne $expectedHash){throw 'Unknown R135 EXE SHA256. No execution attempted.'}
if((Get-Process -Id $PID).SessionId -eq 0){throw 'Run this launcher by double-clicking it in the logged-in Windows desktop session.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class XpzR135R7CThread {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenThread(uint access,bool inherit,uint id);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint ResumeThread(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
function Resume-IfSuspended([int]$targetPid) {
 $w=Get-CimInstance Win32_Process -Filter ("ProcessId="+$targetPid) -ErrorAction SilentlyContinue
 if(!$w -or $w.Name -ine $name -or $w.SessionId -eq 0 -or $w.CommandLine -notlike ('*'+$name+'*')){return}
 $p=Get-Process -Id $targetPid -ErrorAction SilentlyContinue
 if(!$p){return}
 foreach($t in @($p.Threads)) {
  if($t.ThreadState -ne 'Wait' -or $t.WaitReason -ne 'Suspended'){continue}
  $h=[XpzR135R7CThread]::OpenThread(2,$false,[uint32]$t.Id)
  if($h -eq [IntPtr]::Zero){Trace ("Cannot open suspended thread "+$t.Id);continue}
  try {
   $old=[XpzR135R7CThread]::ResumeThread($h)
   if($old -ne [uint32]::MaxValue){Trace ("Resumed PID="+$targetPid+" TID="+$t.Id+" previousSuspendCount="+$old)}
  } finally {[void][XpzR135R7CThread]::CloseHandle($h)}
 }
}
$others=@(Get-CimInstance Win32_Process|Where-Object {$_.Name -ieq $name -and $_.SessionId -ne 0})
if(@(Get-CimInstance Win32_Process | Where-Object {$_.Name -like "openxcom*" -and $_.Name -ine $name}).Count -gt 0){throw "Another OpenXcom game version is running; close it before launching R7C to protect game state."}
if($others.Count -gt 1){throw 'More than one R135-R7C process exists. Please close duplicates manually.'}
if($others.Count -eq 1){
 $targetPid=[int]$others[0].ProcessId
 Trace ('R135 already running PID='+$targetPid)
 Resume-IfSuspended $targetPid
 try{[void](New-Object -ComObject WScript.Shell).AppActivate($targetPid)}catch{}
 exit 0
}
Trace ('Launch='+$exe)
$p=Start-Process -FilePath $exe -WorkingDirectory $game -PassThru -ErrorAction Stop
Trace ('New PID='+$p.Id)
$ready=$false
for($i=0;$i -lt $StartupSeconds*2;$i++) {
 Start-Sleep -Milliseconds 500
 $live=Get-Process -Id $p.Id -ErrorAction SilentlyContinue
 if(!$live){Trace 'R135 exited during startup';exit 3}
 Resume-IfSuspended $p.Id
 $live=Get-Process -Id $p.Id -ErrorAction SilentlyContinue
 if($live -and $live.MainWindowHandle -ne 0 -and $live.Responding){
  Trace ('WINDOW_READY TITLE='+$live.MainWindowTitle)
  $ready=$true
  break
 }
}
if(!$ready) {
 Trace ('WINDOW_NOT_READY after '+$StartupSeconds+'s; closing only the exact R135 process spawned by this launcher.')
 $check=Get-CimInstance Win32_Process -Filter ("ProcessId="+$p.Id) -ErrorAction SilentlyContinue
 if($check -and $check.Name -ieq $name -and $check.CommandLine -like ('*'+$name+'*')){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue}
 exit 4
}
Trace ('R135 is running; launcher waits for game exit.')
try{Wait-Process -Id $p.Id -ErrorAction SilentlyContinue}finally{Trace 'R135 process exited.'}
