param(
 [string]$GameRoot='C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez',
 [string]$SourceSave='',
 [switch]$NoLaunch
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $GameRoot).Path
$originalUser=Join-Path $root 'user'
$sourceDir=Join-Path $originalUser 'piratez'
if(!$SourceSave){
 $SourceSave=(Get-ChildItem -LiteralPath $sourceDir -Filter 'ATLAS_PLAYTEST_*.sav' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if(!$SourceSave){throw 'Run install-atlas-play-start.ps1 first'}
$source=(Resolve-Path -LiteralPath $SourceSave).Path
if([IO.Path]::GetDirectoryName($source) -ne $sourceDir){throw 'Source must be in original save directory'}
$head=(Get-Content -LiteralPath $source -Encoding UTF8 -TotalCount 16) -join [Environment]::NewLine
if($head -notmatch 'piratez ver: v\.o2\b' -or $head -notmatch 'version:\s*Extended 8\.7\.1' -or $head -match '(?m)^mission:'){throw 'Expected compatible strategic save'}
$launcher=Get-Content -LiteralPath (Join-Path $root 'XPZ_LATEST_INTEGRATED_START.cmd') -Raw
$m=[regex]::Match($launcher,'openxcom_R\d+_COMPLETE_RUNTIME_ALLPATCH\.exe')
if(!$m.Success){throw 'Cannot resolve latest integrated engine'}
$exe=Join-Path $root $m.Value
if(!(Test-Path -LiteralPath $exe -PathType Leaf)){throw 'Engine not found'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$profile=Join-Path $root ('ATLAS_ISOLATED_'+$stamp)
if(Test-Path -LiteralPath $profile){throw 'Profile collision'}
$null=New-Item -ItemType Directory -Path $profile
$saveDir=Join-Path $profile 'piratez'
$null=New-Item -ItemType Directory -Path $saveDir
# Share only installed mod assets. Config, saves, logs and working directory
# are separate; never link or copy the original whole user directory.
$null=New-Item -ItemType Junction -Path (Join-Path $profile 'mods') -Target (Join-Path $originalUser 'mods')
$saveName=[IO.Path]::GetFileName($source)
$dest=Join-Path $saveDir $saveName
Copy-Item -LiteralPath $source -Destination $dest
if((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $dest).Hash){throw 'Test save copy differs'}
Copy-Item -LiteralPath (Join-Path $originalUser 'options.cfg') -Destination (Join-Path $profile 'options.cfg')
$argLine=('-data "{0}" -user "{1}" -config "{1}" -master piratez -load "{2}" -fullscreen false -oxceUpdateCheck false' -f $root,$profile,$saveName)
$restart=Join-Path $profile 'PLAY_TEST.cmd'
$cmd=@('@echo off','setlocal',('cd /d "'+$profile+'"'),('start "" "'+$exe+'" '+$argLine),'exit /b %ERRORLEVEL%')
[IO.File]::WriteAllLines($restart,$cmd,[Text.Encoding]::ASCII)
$result=[ordered]@{profile=$profile;source=$source;save=$dest;saveSha256=(Get-FileHash -LiteralPath $dest).Hash;restart=$restart;engine=$exe;modAssetsShared=$true;processId=$null;log=(Join-Path $profile 'openxcom.log')}
if(!$NoLaunch){
 $p=Start-Process -FilePath $exe -ArgumentList $argLine -WorkingDirectory $profile -PassThru
 $result.processId=$p.Id
}
$result | ConvertTo-Json -Compress
