$ErrorActionPreference='Stop'
# New isolated XPZ3D branch. The parent is the actual R148 Base Matrix cumulative
# archive (it includes R147 safequote, R146 HMS TU, R145 firemode and R144
# globe matrix). Only BattlescapeState.cpp.obj is replaced for new 3D producer.
$root='D:\daphne_auto\XPZ3D_R148S10_DOCKED_VIEW_20261119'
$source=Join-Path $root 'oxce'
$out=Join-Path $root 'build'
$base='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102'
$reset='D:\daphne_auto\XPZ_R137_R136_CUMULATIVE_RESET_20261118'
$parent='D:\daphne_auto\oxce-r135-r3-20261117'
$r137='D:\daphne_auto\oxce-r137-globe-assault-20261118\src'
$r11t='D:\daphne_auto\oxce-r136-r11t-transfer-categories-20261118\src'
$r145='D:\daphne_auto\XPZ_R145_R144_ALLPATCH_FIREMODE_RESTORE_20261119'
$r148='D:\daphne_auto\XPZ_R148_BASE_MATRIX_GPT6_20261119'
$archiveParent=Join-Path $r148 'build\objects_r148_cumulative_base_matrix.a'
$bin='D:\daphne_auto\tools\winlibs64\mingw64\bin'
$resp=Join-Path $base 'stage-autoall-r99-integrated-20261114\build\src\CMakeFiles\openxcom.dir'
$archive=Join-Path $out 'objects_r148s10_allpatch_terrain_actors.a'
$exe=Join-Path $out 'openxcom_R148S10_ALLPATCH_LOFT_PCK_DOCKED_3D.exe'
New-Item -ItemType Directory -Force -Path $out | Out-Null
foreach($f in @($archiveParent,(Join-Path $source 'BattlescapeState.cpp'),(Join-Path $resp 'includes_CXX.rsp'),(Join-Path $resp 'linkLibs.rsp'))){if(!(Test-Path -LiteralPath $f)){throw ('MISSING_REQUIRED_INPUT '+$f)}}
$env:PATH=$bin+';'+$env:PATH
$src=Join-Path $base 'source\src'
$includes=@(
$source,
(Join-Path $r145 'src'),(Join-Path $r145 'src\Battlescape'),
(Join-Path $r148 ''), (Join-Path $reset 'oxce\src'),(Join-Path $reset 'oxce\src\Battlescape'),(Join-Path $reset 'oxce\src\Basescape'),
$r137,(Join-Path $r137 'Geoscape'),(Join-Path $r137 'Savegame'),
$r11t,(Join-Path $r11t 'Basescape'),
(Join-Path $parent 'src'),(Join-Path $parent 'src\Battlescape'),(Join-Path $parent 'src\Basescape'),
(Join-Path $base 'stage-r117-integrated-f-t-cap-heal-20261116\src'),
(Join-Path $base 'stage-r117-integrated-f-t-cap-heal-20261116\src\Basescape'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Battlescape'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Ufopaedia'),
$src,(Join-Path $src 'Battlescape'),(Join-Path $src 'Basescape'),
(Join-Path $src 'Geoscape'),(Join-Path $src 'Savegame'),
(Join-Path $src 'Engine'),(Join-Path $src 'Mod'),(Join-Path $src 'Ufopaedia')
)
$inc=@($includes|ForEach-Object {'-I'+$_})
$inc+=('@'+(Join-Path $resp 'includes_CXX.rsp'))
$obj=Join-Path $out 'BattlescapeState.cpp.obj'
$compileArgs=$inc+@('-std=c++17','-O1','-DNDEBUG','-std=gnu++17',
 '-femit-struct-debug-reduced','-Wall','-Wextra','-Wno-unused-parameter',
 '-c',(Join-Path $source 'BattlescapeState.cpp'),'-o',$obj)
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @compileArgs *> (Join-Path $out 'BattlescapeState.compile.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){Get-Content (Join-Path $out 'BattlescapeState.compile.log') -Tail 75;throw ('R148S10_COMPILE_FAILED '+$rc)}
Write-Output ('COMPILED='+$obj)
$members=@(& (Join-Path $bin 'ar.exe') t $archiveParent)
if($LASTEXITCODE -ne 0 -or $members.Count -ne 413){throw ('R148_PARENT_ARCHIVE_UNEXPECTED '+$members.Count)}
if(@($members|Where-Object {$_ -eq 'BattlescapeState.cpp.obj'}).Count -ne 1){throw 'R148_PARENT_BATTLESTATE_NOT_UNIQUE'}
Copy-Item -LiteralPath $archiveParent -Destination $archive -ErrorAction Stop
$ErrorActionPreference='Continue'
& (Join-Path $bin 'ar.exe') r $archive $obj *> (Join-Path $out 'archive.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){throw ('R148S10_ARCHIVE_FAILED '+$rc)}
$newMembers=@(& (Join-Path $bin 'ar.exe') t $archive)
if($LASTEXITCODE -ne 0 -or $newMembers.Count -ne 413){throw ('R148S10_MEMBERS_UNEXPECTED '+$newMembers.Count)}
for($i=0;$i -lt $members.Count;++$i){if($members[$i] -ne $newMembers[$i]){throw ('R148S10_ARCHIVE_MEMBER_ORDER_CHANGED '+$i)}}
$flags=@('-std=c++17','-O3','-DNDEBUG','-Wl,--export-all-symbols',
 '-mwindows','-Wl,--whole-archive',$archive,'-Wl,--no-whole-archive',
 '-o',$exe,('-Wl,--out-implib,'+(Join-Path $out 'libopenxcom_r148s10.dll.a')),
 '-Wl,--major-image-version,0,--minor-image-version,0',
 ('@'+(Join-Path $resp 'linkLibs.rsp')))
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @flags *> (Join-Path $out 'link.log')
$rc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($rc -ne 0){Get-Content (Join-Path $out 'link.log') -Tail 90;throw ('R148S10_LINK_FAILED '+$rc)}
Write-Output ('R148S10_ARCHIVE_MEMBERS='+$newMembers.Count)
Write-Output ('R148S10_EXE='+$exe)
Write-Output ('R148S10_EXE_SIZE='+(Get-Item -LiteralPath $exe).Length)
Write-Output ('R148S10_EXE_SHA256='+(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash)
Write-Output ('R148S10_PARENT_ARCHIVE_SHA256='+(Get-FileHash -LiteralPath $archiveParent -Algorithm SHA256).Hash)
Write-Output ('R148S10_SRC_SHA256='+(Get-FileHash -LiteralPath (Join-Path $source 'BattlescapeState.cpp') -Algorithm SHA256).Hash)
