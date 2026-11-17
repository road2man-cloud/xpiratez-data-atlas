$ErrorActionPreference='Stop'
$game='C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez'
$name='openxcom_R135_R9E_TEAM_VISION_F12_TEST.exe'
$exe=Join-Path $game $name
$expected='F95FB7124E39920D83F580AA0ABCE82BD4C06BEEAC5FE4BB08C2D6C32C92CAEF'
$out='D:\daphne_auto\oxce-r135-r9e-team-vision-20261117\R9E_INTERACTIVE_SMOKE.log'
if(Test-Path $out){throw 'Smoke log already exists'}
function Record($s){$s | Out-File -FilePath $out -Append -Encoding UTF8}
Record ('START='+ (Get-Date -Format o))
Record ('SESSION='+ (Get-Process -Id $PID).SessionId)
if((Get-Process -Id $PID).SessionId -eq 0){throw 'Interactive session required'}
if((Get-FileHash $exe -Algorithm SHA256).Hash -ne $expected){throw 'R9C hash mismatch'}
if(@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq $name}).Count){throw 'R9C already running'}
$cfg=Join-Path $game 'user\r9e_smoke_cfg_20261117'
if(!(Test-Path $cfg)){New-Item -ItemType Directory -Path $cfg | Out-Null}
$opt=Join-Path $cfg 'options.cfg'
if(!(Test-Path $opt)){Copy-Item -LiteralPath (Join-Path $game 'user\options.cfg') -Destination $opt -ErrorAction Stop}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XpzR9CThread {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenThread(uint a,bool i,uint t);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint ResumeThread(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
}
'@
$p=$null
try {
 $p=Start-Process -FilePath $exe -WorkingDirectory $game -ArgumentList @('-cfg',('"'+$cfg+'"'),'-fullscreen','false','-useOpenGL','false','-displayWidth','1024','-displayHeight','768') -PassThru -ErrorAction Stop
 Record ('STARTED_PID='+$p.Id)
 for($i=0;$i -lt 24;$i++) {
  Start-Sleep -Seconds 1
  $live=Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if(!$live){Record ('EXITED_AT_SECOND='+($i+1));break}
  foreach($t in @($live.Threads)) {
   if($t.ThreadState -ne 'Wait' -or $t.WaitReason -ne 'Suspended'){continue}
   $h=[XpzR9CThread]::OpenThread(2,$false,[uint32]$t.Id)
   if($h -ne [IntPtr]::Zero) {
    try{$prev=[XpzR9CThread]::ResumeThread($h);Record ('RESUMED_THREAD='+$t.Id+' COUNT='+$prev)}
    finally{[void][XpzR9CThread]::CloseHandle($h)}
   }
  }
  $live=Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if($live){
   Record ('SECOND='+($i+1)+' THREADS='+$live.Threads.Count+' CPU='+$live.CPU+' RESP='+$live.Responding+' HWND='+$live.MainWindowHandle+' TITLE='+$live.MainWindowTitle)
   if($live.MainWindowHandle -ne 0 -and $live.Responding){Record 'WINDOW_READY=TRUE';break}
  }
 }
} catch {Record ('ERROR='+$_.Exception.Message);throw}
finally {
 if($p) {
  $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id) -ErrorAction SilentlyContinue
  if($proc -and $proc.Name -ieq $name -and $proc.ExecutablePath -ieq $exe) {
   Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
   Record ('CLEANED_PROBE_PID='+$p.Id)
  }
 }
 Record ('END='+ (Get-Date -Format o))
}
