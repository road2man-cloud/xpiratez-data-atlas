param(
 [ValidateSet('R131','R134')]
 [string]$Version='R131',
 [int]$StartupTimeoutSeconds=30
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$executables=@{
 R131='openxcom_R131_INTEGRATED_TU_POW_AUTOALL.exe'
 R134='openxcom_R134_AUTOALL_MED_OFFHAND_WEAR.exe'
}
$exe=Join-Path $root $executables[$Version]
if(!(Test-Path -LiteralPath $exe)){throw "Executable not found: $exe"}
if((Get-Process -Id $PID).SessionId -eq 0){
 throw 'Start this launcher in your logged-in desktop session, not a service session.'
}
$existing=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -like 'openxcom*.exe'})
if($existing.Count){
 $existing | Select-Object ProcessId,Name,CommandLine|Format-Table -AutoSize|Out-String|Write-Host
 throw 'An OpenXcom process already exists. No new instance was launched.'
}
$logDir=Join-Path $root 'user\launch-diagnostics'
if(!(Test-Path $logDir)){New-Item -ItemType Directory -Force -Path $logDir|Out-Null}
$log=Join-Path $logDir ('safe-launch-'+$Version+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.txt')
$proc=$null
$ok=$false
try{
 "version=$Version exe=$exe launchedAt=$(Get-Date -Format o)"|Set-Content -LiteralPath $log -Encoding UTF8
 $proc=Start-Process -FilePath $exe -WorkingDirectory $root -PassThru
 "pid=$($proc.Id)"|Add-Content -LiteralPath $log
 $iterations=[math]::Max(2,$StartupTimeoutSeconds*2)
 for($n=0;$n -lt $iterations;$n++){
  Start-Sleep -Milliseconds 500
  $live=Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if(!$live){'Process exited before creating a window.'|Add-Content $log;break}
  if([int64]$live.MainWindowHandle -ne 0 -and $live.Responding){
   "startup=WINDOW_RESPONDING timeMs=$(($n+1)*500) window=$($live.MainWindowTitle)"|Add-Content $log
   $ok=$true
   break
  }
 }
 if(!$ok){throw "No responsive window within $StartupTimeoutSeconds seconds. See $log"}
 Write-Host "Started $Version successfully (PID $($proc.Id))."
 Write-Host "Log: $log"
}catch{
 "startup=FAILED error=$($_.Exception.Message)"|Add-Content -LiteralPath $log
 # Only terminate the exact new process created by THIS launcher.
 if($proc){
  $live=Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if($live){Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue}
 }
 throw
}
