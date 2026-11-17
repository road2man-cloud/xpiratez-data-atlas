$ErrorActionPreference='Stop'
$stage='D:\daphne_auto\oxce-r135-r9c-r8-cumulative-20261117'
$root='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102'
$R8='D:\daphne_auto\oxce-r135-r8-live-search-five-20261117'
$R7C='D:\daphne_auto\oxce-r135-r7c-r131baseline-20261117'
$R7B='D:\daphne_auto\oxce-r135-r7b-r131baseline-20261117'
$R7='D:\daphne_auto\oxce-r135-r7-r131baseline-20261117'
$src=Join-Path $root 'source\src'
$bin='D:\daphne_auto\tools\winlibs64\mingw64\bin'
$resp=Join-Path $root 'stage-autoall-r99-integrated-20261114\build\src\CMakeFiles\openxcom.dir'
$sourceArchive=Join-Path $R8 'build\objects_r135_r8_r131baseline.a'
$build=Join-Path $stage 'build'
$archive=Join-Path $build 'objects_r135_r9c_r8_cumulative.a'
$exe=Join-Path $build 'openxcom_R135_R9C_R8_CUMULATIVE_TEST.exe'
$files=@('Battlescape\BattlescapeState.cpp','Battlescape\UnitWalkBState.cpp','Battlescape\ExperienceOverviewState.cpp','Battlescape\Map.cpp','main.cpp')
if((Test-Path $archive) -or (Test-Path $exe)){throw 'R9 output exists; refusing overwrite'}
foreach($f in @($sourceArchive,(Join-Path $resp 'includes_CXX.rsp'),(Join-Path $resp 'linkLibs.rsp'))){if(!(Test-Path $f)){throw ('Required input missing '+$f)}}
$includes=@(
 (Join-Path $stage 'src'),(Join-Path $stage 'src\Battlescape'),
 (Join-Path $R8 'src'),(Join-Path $R8 'src\Basescape'),
 (Join-Path $R7C 'src'),(Join-Path $R7C 'src\Basescape'),
 (Join-Path $R7B 'src'),(Join-Path $R7B 'src\Basescape'),
 (Join-Path $R7 'src'),(Join-Path $R7 'src\Basescape'),(Join-Path $R7 'src\Battlescape'),
 (Join-Path $root 'stage-r134-integrated-r133-gear-med-20261117\src'),
 (Join-Path $root 'stage-r134-integrated-r133-gear-med-20261117\src\Battlescape'),
 (Join-Path $root 'stage-r134-integrated-r133-gear-med-20261117\src\Ufopaedia'),
 $src,(Join-Path $src 'Battlescape'),(Join-Path $src 'Basescape'),
 (Join-Path $src 'Savegame'),(Join-Path $src 'Engine'),
 (Join-Path $src 'Geoscape'),(Join-Path $src 'Ufopaedia')
)
$inc=@()
foreach($i in $includes){if(Test-Path $i){$inc+=('-I'+$i)}}
$inc+=('@'+(Join-Path $resp 'includes_CXX.rsp'))
$env:PATH=$bin+';'+$env:PATH
$objects=@()
foreach($rel in $files){
 $file=Join-Path (Join-Path $stage 'src') $rel
 $name=[IO.Path]::GetFileName($file)
 $obj=Join-Path $build ($name+'.obj')
 if(Test-Path $obj){if((Get-Item $obj).Length -lt 20000){throw ('Incomplete object '+$obj)};Write-Output ('REUSE_COMPILED_OBJECT '+$obj);$objects+=$obj;continue}
 $argsList=$inc+@('-std=c++17','-O1','-DNDEBUG','-std=gnu++17','-femit-struct-debug-reduced','-Wall','-Wextra','-Wno-unused-parameter','-c',$file,'-o',$obj)
 Write-Output ('COMPILING '+$rel)
 $ErrorActionPreference='Continue'
 & (Join-Path $bin 'g++.exe') @argsList *> (Join-Path $build ($name+'.compile.log'))
 $code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 if($code -ne 0){Get-Content (Join-Path $build ($name+'.compile.log')) -Tail 45;throw ('COMPILE FAILED '+$rel+' exit='+$code)}
 $objects+=$obj
 Write-Output ('COMPILED '+$name+' bytes='+(Get-Item $obj).Length)
}
$before=@(& (Join-Path $bin 'ar.exe') t $sourceArchive)
if($before.Count -ne 413){throw ('Unexpected R8 archive count '+$before.Count)}
Copy-Item -LiteralPath $sourceArchive -Destination $archive -ErrorAction Stop
$ErrorActionPreference='Continue'
& (Join-Path $bin 'ar.exe') r $archive @objects *> (Join-Path $build 'archive.log')
$code=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($code -ne 0){throw ('archive failed '+$code)}
$after=@(& (Join-Path $bin 'ar.exe') t $archive)
if($after.Count -ne $before.Count){throw ('archive count changed '+$after.Count)}
foreach($member in $before){if($member -notin $after){throw ('Missing member '+$member)}}
$flags=@('-std=c++17','-O3','-DNDEBUG','-Wl,--export-all-symbols','-mwindows','-Wl,--whole-archive',$archive,'-Wl,--no-whole-archive','-o',$exe)
$flags+=('-Wl,--out-implib,'+(Join-Path $build 'libopenxcom_r135_r9c.dll.a'))
$flags+='-Wl,--major-image-version,0,--minor-image-version,0'
$flags+=('@'+(Join-Path $resp 'linkLibs.rsp'))
Write-Output 'LINKING R9'
$ErrorActionPreference='Continue'
& (Join-Path $bin 'g++.exe') @flags *> (Join-Path $build 'link.log')
$code=$LASTEXITCODE
$ErrorActionPreference='Stop'
if($code -ne 0){Get-Content (Join-Path $build 'link.log') -Tail 45;throw ('LINK FAILED '+$code)}
Write-Output ('R9C_EXE='+$exe)
Write-Output ('BYTES='+(Get-Item $exe).Length)
Write-Output ('SHA256='+(Get-FileHash $exe -Algorithm SHA256).Hash)
Write-Output ('ARCHIVE_MEMBERS='+$after.Count)
