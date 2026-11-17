$ErrorActionPreference='Stop'
$game='C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez'
$name='openxcom_R135_R9G_WEARABLE_SAFE_F12_TEAM_TEST.exe'
$launcher=Join-Path $game 'XPZ_R135_R9G_START.cmd'
$exe=Join-Path $game $name
$report='D:\daphne_auto\oxce-r135-r9g-accessory-preserve-20261117\R9G_LAUNCHER_SMOKE.log'
if(Test-Path $report){throw 'Smoke report already exists'}
function Report($s){$s | Out-File $report -Encoding UTF8 -Append}
Report ("START="+(Get-Date -Format o))
Report ("SESSION="+(Get-Process -Id $PID).SessionId)
if((Get-Process -Id $PID).SessionId -ne 1){throw 'Interactive session required'}
$existing=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -ieq $name})
if($existing.Count){throw 'Test target already running'}
$cmdProcess=$null;$candidatePid=0
try{
 $cmdProcess=Start-Process -FilePath 'C:\Windows\System32\cmd.exe' -ArgumentList ('/c "'+$launcher+'"') -WorkingDirectory $game -PassThru -ErrorAction Stop
 Report ('CMD_PID='+$cmdProcess.Id)
 for($i=1;$i -le 12;$i++){
   Start-Sleep -Seconds 1
   $candidates=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -ieq $name -and $_.SessionId -eq 1})
   if($candidates.Count -eq 1){$candidatePid=[int]$candidates[0].ProcessId}
   if($candidatePid){
      $p=Get-Process -Id $candidatePid -ErrorAction SilentlyContinue
      if($p){
       Report ("SEC=$i PID=$candidatePid THREADS="+$p.Threads.Count+" CPU="+$p.CPU+" RESPONDING="+$p.Responding+" HWND="+$p.MainWindowHandle+" TITLE="+$p.MainWindowTitle)
       if($p.MainWindowHandle -ne 0 -and $p.Responding){Report 'RESULT=WINDOW_READY';break}
      }
   }
 }
}finally{
 if($candidatePid){
  $c=Get-CimInstance Win32_Process -Filter "ProcessId=$candidatePid" -ErrorAction SilentlyContinue
  if($c -and $c.Name -ieq $name -and $c.CommandLine -like ('*'+$name+'*')){Stop-Process -Id $candidatePid -Force -ErrorAction SilentlyContinue;Report ('CLEANED_EXACT_PID='+$candidatePid)}
 }
 if($cmdProcess){$p=Get-Process -Id $cmdProcess.Id -ErrorAction SilentlyContinue;if($p){Stop-Process -Id $cmdProcess.Id -Force -ErrorAction SilentlyContinue}}
 Report ("END="+(Get-Date -Format o))
}
