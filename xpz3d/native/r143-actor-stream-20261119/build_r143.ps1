$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ_R143_ACTOR_STREAM_20261119'
$reset='D:\daphne_auto\XPZ_R137_R136_CUMULATIVE_RESET_20261118'
$stage=Join-Path $root 'oxce'
$out=Join-Path $stage 'build'
$base='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102'
$parent='D:\daphne_auto\oxce-r135-r3-20261117'
$bin='D:\daphne_auto\tools\winlibs64\mingw64\bin'
$resp=Join-Path $base 'stage-autoall-r99-integrated-20261114\build\src\CMakeFiles\openxcom.dir'
$prior='D:\daphne_auto\XPZ_R142_TERRAIN_CUMULATIVE_20261119\oxce\build\objects_r142_terrain_cumulative.a'
$archive=Join-Path $out 'objects_r143_actor_stream.a'
$exe=Join-Path $out 'openxcom_R143_R142_CUMULATIVE_ACTORS.exe'
$env:PATH=$bin+';'+$env:PATH
$source=Join-Path $base 'source\src'
$incs=@($stage,(Join-Path $reset 'oxce\src'),(Join-Path $reset 'oxce\src\Battlescape'),(Join-Path $reset 'oxce\src\Basescape'),(Join-Path $parent 'src'),(Join-Path $parent 'src\Battlescape'),(Join-Path $parent 'src\Basescape'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Battlescape'),(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Ufopaedia'),$source,(Join-Path $source 'Battlescape'),(Join-Path $source 'Basescape'),(Join-Path $source 'Savegame'),(Join-Path $source 'Engine'),(Join-Path $source 'Geoscape'),(Join-Path $source 'Ufopaedia'))
$argsList=@($incs|ForEach-Object {'-I'+$_})
$argsList+=('@'+(Join-Path $resp 'includes_CXX.rsp'))
$obj=Join-Path $out 'BattlescapeState.cpp.obj'
$argsList+=@('-std=c++17','-O1','-DNDEBUG','-std=gnu++17','-femit-struct-debug-reduced','-Wall','-Wextra','-Wno-unused-parameter','-c',(Join-Path $stage 'BattlescapeState.cpp'),'-o',$obj)
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @argsList *> (Join-Path $out 'compile.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){Get-Content (Join-Path $out 'compile.log') -Tail 60;throw ('OXCE_COMPILE_FAILED '+$rc)}
$before=@(& (Join-Path $bin 'ar.exe') t $prior)
if($before.Count -ne 413){throw ('R143_ARCHIVE_UNEXPECTED '+$before.Count)}
Copy-Item -LiteralPath $prior -Destination $archive
$ErrorActionPreference='Continue'
& (Join-Path $bin 'ar.exe') r $archive $obj *> (Join-Path $out 'archive.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){throw ('OXCE_ARCHIVE_FAILED '+$rc)}
$after=@(& (Join-Path $bin 'ar.exe') t $archive)
if($after.Count -ne 413){throw ('R143_ARCHIVE_UNEXPECTED '+$after.Count)}
$flags=@('-std=c++17','-O3','-DNDEBUG','-Wl,--export-all-symbols','-mwindows','-Wl,--whole-archive',$archive,'-Wl,--no-whole-archive','-o',$exe)
$flags+=('-Wl,--out-implib,'+(Join-Path $out 'libopenxcom_r143.dll.a'))
$flags+='-Wl,--major-image-version,0,--minor-image-version,0'
$flags+=('@'+(Join-Path $resp 'linkLibs.rsp'))
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @flags *> (Join-Path $out 'link.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){Get-Content (Join-Path $out 'link.log') -Tail 55;throw ('OXCE_LINK_FAILED '+$rc)}
Write-Output ('R143_OXCE_EXE='+$exe)
Write-Output ('R143_OXCE_SIZE='+(Get-Item $exe).Length)
Write-Output ('R143_OXCE_SHA256='+(Get-FileHash $exe -Algorithm SHA256).Hash)
