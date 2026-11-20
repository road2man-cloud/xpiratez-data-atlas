$ErrorActionPreference='Stop'
$stage='D:\daphne_auto\XPZ_R188_GIT_WORKTREE_20261120\experiments\openxcom-native\r188-route-fallback'
$out=Join-Path $stage 'build'
$base='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102'
$root='D:\daphne_auto\XPZ_R137_R136_CUMULATIVE_RESET_20261118'
$r144='D:\daphne_auto\XPZ_R144_R143_GEOSCAPE_MATRIX_RESTORE_20261119\src'
$r137='D:\daphne_auto\oxce-r137-globe-assault-20261118\src'
$r11t='D:\daphne_auto\oxce-r136-r11t-transfer-categories-20261118\src'
$parentSource='D:\daphne_auto\oxce-r135-r3-20261117\src'
$src=Join-Path $base 'source\src'
$bin='D:\daphne_auto\tools\winlibs64\mingw64\bin'
$resp=Join-Path $base 'stage-autoall-r99-integrated-20261114\build\src\CMakeFiles\openxcom.dir'
$prior='D:\daphne_auto\XPZ_R187_GIT_WORKTREE_20261120\experiments\openxcom-native\r187-ground-spread\build\objects_r187_cumulative_ground_spread.a'
$parentExe='C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R187_ALLPATCH_GRENADE_GROUND_SPREAD.exe'
$archive=Join-Path $out 'objects_r188_cumulative_route_fallback.a'
$exe=Join-Path $out 'openxcom_R188_ALLPATCH_GRENADE_ROUTE_FALLBACK.exe'
$expectedParent='D3CAB85B9458A19A89F1D99C2D259245677EED1037AA83DE46297A5BCC184668'
if((Get-FileHash -LiteralPath $parentExe -Algorithm SHA256).Hash -ne $expectedParent){throw 'R171_PARENT_EXE_CHANGED'}


if ((Get-Content -LiteralPath (Join-Path $stage 'src\main.cpp') -Raw) -notmatch 'R188-GRENADE-ROUTE-FALLBACK'){throw 'R169_TITLE_SOURCE_MISSING'}
if (Test-Path -LiteralPath $exe){throw 'R188_EXE_ALREADY_EXISTS'}
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:PATH=$bin+';'+$env:PATH
foreach($p in @($prior,(Join-Path $resp 'includes_CXX.rsp'),(Join-Path $resp 'linkLibs.rsp'))){if(!(Test-Path -LiteralPath $p)){throw ('DEPENDENCY_MISSING '+$p)}}
$incs=@(
(Join-Path $stage 'src'),(Join-Path $stage 'src\Battlescape'),(Join-Path $stage 'src\Geoscape'),(Join-Path $stage 'src\Shared'),(Join-Path $stage 'src\Ufopaedia'),
$stage,$r144,(Join-Path $r144 'Geoscape'),(Join-Path $r144 'Basescape'),
(Join-Path $root 'oxce\src'),(Join-Path $root 'oxce\src\Battlescape'),(Join-Path $root 'oxce\src\Basescape'),
$r137,(Join-Path $r137 'Geoscape'),(Join-Path $r137 'Savegame'),
$r11t,(Join-Path $r11t 'Basescape'),
$parentSource,(Join-Path $parentSource 'Battlescape'),(Join-Path $parentSource 'Basescape'),
(Join-Path $base 'stage-r117-integrated-f-t-cap-heal-20261116\src'),
(Join-Path $base 'stage-r117-integrated-f-t-cap-heal-20261116\src\Basescape'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Battlescape'),
(Join-Path $base 'stage-r134-integrated-r133-gear-med-20261117\src\Ufopaedia'),
$src,(Join-Path $src 'Battlescape'),(Join-Path $src 'Basescape'),(Join-Path $src 'Geoscape'),
(Join-Path $src 'Savegame'),(Join-Path $src 'Engine'),(Join-Path $src 'Ufopaedia'),(Join-Path $src 'Mod')
)
$common=@($incs | ForEach-Object {'-I'+$_})
$common+=('@'+(Join-Path $resp 'includes_CXX.rsp'))
$units=@('TransferItemsState','InventoryState','main')
$objects=@()
foreach($unit in $units){
 $cpp = if ($unit -eq 'TransferItemsState') { Join-Path $stage 'src\Basescape\TransferItemsState.cpp' }
     elseif ($unit -eq 'InventoryState') { Join-Path $stage 'src\Battlescape\InventoryState.cpp' }
     elseif ($unit -eq 'SoldierMatrixState' -or $unit -eq 'SoldierTransformationListState') { Join-Path $stage ('src\Basescape\'+$unit+'.cpp') }
     elseif ($unit -eq 'main') { Join-Path $stage 'src\main.cpp' }
     else { throw ('UNKNOWN_UNIT '+$unit) }
 $obj=Join-Path $out ($unit+'.cpp.obj')
 $argsList=$common+@('-std=c++17','-O1','-DNDEBUG','-std=gnu++17',
    '-femit-struct-debug-reduced','-Wall','-Wextra','-Wno-unused-parameter',
    '-c',$cpp,'-o',$obj)
 $ErrorActionPreference='Continue'
 & (Join-Path $bin 'g++.exe') @argsList *> (Join-Path $out ($unit+'.compile.log'))
 $compileRc=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 if($compileRc -ne 0){
  Get-Content -LiteralPath (Join-Path $out ($unit+'.compile.log')) -Tail 100
  throw ('R171_COMPILE_FAILED '+$unit+' '+$compileRc)
 }
 $objects += $obj
 Write-Output ('COMPILED='+$unit)
}
$ar=(Join-Path $bin 'ar.exe')
$before=@(& $ar t $prior)
if($LASTEXITCODE -ne 0 -or $before.Count -ne 413){throw ('R169_ARCHIVE_INVALID '+$before.Count)}
foreach($unit in $units){
 if(@($before | Where-Object{$_ -eq ($unit+'.cpp.obj')}).Count -ne 1){throw ('R169_MEMBER_NOT_UNIQUE '+$unit)}
}
Copy-Item -LiteralPath $prior -Destination $archive -ErrorAction Stop
$ErrorActionPreference='Continue'
& $ar r $archive @objects *> (Join-Path $out 'archive.log')
$arcRc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($arcRc -ne 0){throw ('R171_ARCHIVE_FAILED '+$arcRc)}
$after=@(& $ar t $archive)
if($LASTEXITCODE -ne 0 -or $after.Count -ne 413){throw ('R169_ARCHIVE_MEMBERS '+$after.Count)}
for($i=0; $i -lt $before.Count; ++$i){if($before[$i] -ne $after[$i]){throw ('ARCHIVE_MEMBER_ORDER_CHANGED '+$i)}}
$flags=@('-std=c++17','-O3','-DNDEBUG','-Wl,--export-all-symbols','-mwindows',
 '-Wl,--whole-archive',$archive,'-Wl,--no-whole-archive','-o',$exe)
$flags+=('-Wl,--out-implib,'+(Join-Path $out 'libopenxcom_r188.dll.a'))
$flags+='-Wl,--major-image-version,0,--minor-image-version,0'
$flags+=('@'+(Join-Path $resp 'linkLibs.rsp'))
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @flags *> (Join-Path $out 'link.log')
$linkRc=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($linkRc -ne 0){
 Get-Content -LiteralPath (Join-Path $out 'link.log') -Tail 100
 throw ('R171_LINK_FAILED '+$linkRc)
}
Write-Output ('ARCHIVE_MEMBERS='+$after.Count)
Write-Output ('EXE='+$exe)
Write-Output ('SIZE='+(Get-Item -LiteralPath $exe).Length)
Write-Output ('SHA256='+(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash)
foreach($o in $objects){Write-Output ('REBUILT_'+(Split-Path $o -Leaf)+'_SHA256='+(Get-FileHash -LiteralPath $o -Algorithm SHA256).Hash)}

# Mandatory R182 native formatter test before feature gate and release.
$cppTest=Join-Path $stage 'tests\grenade_tu_label_test.cpp'
$testExe=Join-Path $out 'grenade_tu_label_test.exe'
if(!(Test-Path -LiteralPath $cppTest)){throw 'R188_TEST_SOURCE_MISSING'}
& (Join-Path $bin 'g++.exe') -std=c++17 -O2 $cppTest -o $testExe
if($LASTEXITCODE -ne 0){throw 'R188_TEST_COMPILE_FAILED'}
& $testExe
if($LASTEXITCODE -ne 0){throw 'R188_TEST_FAILED'}
Write-Output 'R188_GRENADE_FORMATTER_TEST=PASS'

# R186 adaptive ground page search test (must pass before release).
$groundTest=Join-Path $stage 'tests\ground_scan_test.cpp'
$groundExe=Join-Path $out 'ground_scan_test.exe'
if(!(Test-Path -LiteralPath $groundTest)){throw 'R188_GROUND_TEST_MISSING'}
& (Join-Path $bin 'g++.exe') -std=c++17 -O2 $groundTest -o $groundExe
if($LASTEXITCODE -ne 0){throw 'R188_GROUND_TEST_COMPILE_FAILED'}
& $groundExe
if($LASTEXITCODE -ne 0){throw 'R188_GROUND_TEST_FAILED'}
Write-Output 'R188_GROUND_SCAN_TEST=PASS'

# Mandatory R186 feature contract gate: block promotion if any required patch is absent.
$py='C:\Users\road4\AppData\Local\Programs\Python\Python311\python.exe'
$guard=Join-Path $stage 'feature_gate_r188.py'
if(!(Test-Path -LiteralPath $guard)){throw 'R188_FEATURE_GUARD_MISSING'}
& $py $guard
if($LASTEXITCODE -ne 0){throw 'R188_FEATURE_GUARD_FAILED'}