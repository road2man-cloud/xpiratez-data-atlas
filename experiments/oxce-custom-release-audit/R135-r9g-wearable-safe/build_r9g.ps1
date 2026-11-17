$ErrorActionPreference='Stop'
$base='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102'
$parent='D:\daphne_auto\oxce-r135-r3-20261117'
$stage='D:\daphne_auto\oxce-r135-r9g-accessory-preserve-20261117'
$out=Join-Path $stage 'build-r9g'
$bin='D:\daphne_auto\tools\winlibs64\mingw64\bin'
$respDir=Join-Path $base 'stage-autoall-r99-integrated-20261114\build\src\CMakeFiles\openxcom.dir'
$priorArchive='D:\daphne_auto\oxce-r135-r9f-jewelry-safety-20261117\build-r9f\objects_r135_r9f_jewelry_safe.a'
$archive=Join-Path $out 'objects_r135_r9g_wearable_safe.a'
$exe=Join-Path $out 'openxcom_R135_R9G_WEARABLE_SAFE_F12_TEAM_TEST.exe'
if(!(Test-Path $out)){New-Item -ItemType Directory -Path $out -Force | Out-Null}
New-Item -ItemType Directory -Path $out -Force | Out-Null
$src=Join-Path $base 'source\src'
$incs=@((Join-Path $stage 'src'),(Join-Path $stage 'src\Basescape'),(Join-Path $stage 'src\Battlescape'),(Join-Path $parent 'src'),(Join-Path $parent 'src\Battlescape'),(Join-Path $parent 'src\Basescape'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Battlescape'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Ufopaedia'),$src,(Join-Path $src 'Battlescape'),(Join-Path $src 'Basescape'),(Join-Path $src 'Savegame'),(Join-Path $src 'Engine'),(Join-Path $src 'Geoscape'),(Join-Path $src 'Ufopaedia'))
$inc=@()
foreach($i in $incs){$inc+=('-I'+$i)}
$inc+=('@'+(Join-Path $respDir 'includes_CXX.rsp'))
$units=@('InventoryState','main')
$objects=@()
$env:PATH=$bin+';'+$env:PATH
foreach($unit in $units){
  $rel=if($unit -eq 'main'){'main.cpp'}else{'Battlescape\'+$unit+'.cpp'}
  $source=Join-Path (Join-Path $stage 'src') $rel
  $obj=Join-Path $out ($unit+'.cpp.obj')
  if(Test-Path $obj){
    if((Get-Item $obj).Length -lt 10000){throw ('Incomplete object '+$obj)}
    $objects+=$obj
    Write-Output ('REUSE_COMPILED='+$unit+' bytes='+(Get-Item $obj).Length)
    continue
  }
  $argsList=$inc+@('-std=c++17','-O1','-DNDEBUG','-std=gnu++17','-femit-struct-debug-reduced','-Wall','-Wextra','-Wno-unused-parameter','-c',$source,'-o',$obj)
  $ErrorActionPreference='Continue'
  & (Join-Path $bin 'g++.exe') @argsList *> (Join-Path $out ($unit+'.compile.log'))
  $rc=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if($rc -ne 0){Get-Content (Join-Path $out ($unit+'.compile.log')) -Tail 55;throw ('Compilation failed '+$unit+' '+$rc)}
  $objects+=$obj
  Write-Output ('COMPILED='+$unit+' bytes='+(Get-Item $obj).Length)
}
$before=@(& (Join-Path $bin 'ar.exe') t $priorArchive)
if($before.Count -ne 413){throw ('R9C archive count unexpected: '+$before.Count)}
Copy-Item -LiteralPath $priorArchive -Destination $archive -ErrorAction Stop
$ErrorActionPreference='Continue'
& (Join-Path $bin 'ar.exe') r $archive @objects *> (Join-Path $out 'archive.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){throw ('ar failed '+$rc)}
$after=@(& (Join-Path $bin 'ar.exe') t $archive)
if($after.Count -ne 413){throw ('R9G archive member count '+$after.Count)}
foreach($m in $before){if($m -notin $after){throw ('Missing archive member '+$m)}}
$flags=@('-std=c++17','-O3','-DNDEBUG','-Wl,--export-all-symbols','-mwindows','-Wl,--whole-archive',$archive,'-Wl,--no-whole-archive','-o',$exe)
$flags+=('-Wl,--out-implib,'+(Join-Path $out 'libopenxcom_r135_r9g.dll.a'))
$flags+='-Wl,--major-image-version,0,--minor-image-version,0'
$flags+=('@'+(Join-Path $respDir 'linkLibs.rsp'))
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @flags *> (Join-Path $out 'link.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){Get-Content (Join-Path $out 'link.log') -Tail 50;throw ('Link failed '+$rc)}
Write-Output ('ARCHIVE_MEMBERS='+$after.Count)
Write-Output ('R9G_EXE='+$exe)
Write-Output ('R9G_SHA256='+(Get-FileHash $exe -Algorithm SHA256).Hash)
Write-Output ('R9G_BYTES='+(Get-Item $exe).Length)
