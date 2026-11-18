$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ_R143_ACTOR_STREAM_20261119'
$parent='D:\daphne_auto\XPZ_R142_TERRAIN_CUMULATIVE_20261119'
$ox=Join-Path $root 'oxce'
$s2=Join-Path $root 's2'
New-Item -ItemType Directory -Force -Path $ox,$s2,(Join-Path $ox 'build') | Out-Null
function ReplaceUnique([string]$source,[string]$anchor,[string]$replacement) {
 $pieces=$source.Split([string[]]@($anchor),[StringSplitOptions]::None)
 if($pieces.Count -ne 2){throw ('ANCHOR_COUNT='+$pieces.Count+' '+$anchor.Substring(0,[Math]::Min(65,$anchor.Length)))}
 return $pieces[0]+$replacement+$pieces[1]
}
$lf=[Environment]::NewLine
$source=Get-Content -Raw -LiteralPath (Join-Path $parent 'oxce\BattlescapeState.cpp')
$source=ReplaceUnique $source '#include "XPZ3DOXCEMapAdapterR137.h"' ('#include "XPZ3DOXCEMapAdapterR137.h"'+$lf+'#include "XPZ3DOXCEActorProducerR143.h"')
$source=ReplaceUnique $source 'XPZ3DPublishLiveTerrain(_save);' ('XPZ3DPublishLiveTerrain(_save);'+$lf+[char]9+'XPZ3DActorR143::Publish(_save,XPZ3DSession().epoch);')
[IO.File]::WriteAllText((Join-Path $ox 'BattlescapeState.cpp'),$source,[Text.UTF8Encoding]::new($false))
foreach($n in @('XPZ3DOXCEMapAdapterR137.h','XPZ3DTerrainIncrementalR137.h','XPZ3DTerrainRingR137.h','XPZ3DTerrainWireR137.h','XPZ3DLiveViewProducer.h')) {
 Copy-Item -LiteralPath (Join-Path $parent ('oxce\'+$n)) -Destination (Join-Path $ox $n)
}
Copy-Item -LiteralPath (Join-Path $root 'XPZ3DActorWireR143.h') -Destination (Join-Path $ox 'XPZ3DActorWireR143.h')
Copy-Item -LiteralPath (Join-Path $root 'XPZ3DOXCEActorProducerR143.h') -Destination (Join-Path $ox 'XPZ3DOXCEActorProducerR143.h')
$source=Get-Content -Raw -LiteralPath (Join-Path $parent 's2\iMissionBase-r136.cpp')
$source=ReplaceUnique $source '#include "XPZ3DTerrainGpuOverlayR137.h"' ('#include "XPZ3DTerrainGpuOverlayR137.h"'+$lf+'#include "XPZ3DActorGpuR143.h"')
$anchor='        // R136: record real native render-frame progress at a bounded rate.'
$replacement=@'
        // R143: visual-only OXCE unit roster, player fog remains authoritative.
        static XPZ3DActorR143::Consumer actorReader;
        static XPZ3DActorR143::NativeActorOverlay actorOverlay;
        static DWORD actorLastReceived=0;
        XPZ3DActorFrameR143 actorFrame={};
        if(actorReader.Read(actorFrame)) {
            actorLastReceived=GetTickCount();
            actorOverlay.Apply(GetScene(),actorFrame);
        } else if(actorLastReceived && DWORD(GetTickCount()-actorLastReceived)>1500u) {
            actorOverlay.Reset();
            actorLastReceived=0;
        }
'@
$source=ReplaceUnique $source $anchor ($replacement.TrimEnd()+$lf+$anchor)
[IO.File]::WriteAllText((Join-Path $s2 'iMissionBase-r136.cpp'),$source,[Text.UTF8Encoding]::new($false))
foreach($n in @('XPZ3DLiveViewConsumer.h','XPZ3DLiveViewWire.h','XPZ3DTerrainWireR137.h','XPZ3DTerrainRingR137.h','XPZ3DTerrainIncrementalR137.h','XPZ3DTerrainVisualMeshR137.h','XPZ3DTerrainGpuOverlayR137.h')) {
 Copy-Item -LiteralPath (Join-Path $parent ('s2\'+$n)) -Destination (Join-Path $s2 $n)
}
Copy-Item -LiteralPath (Join-Path $root 'XPZ3DActorWireR143.h') -Destination (Join-Path $s2 'XPZ3DActorWireR143.h')
Copy-Item -LiteralPath (Join-Path $root 'XPZ3DActorGpuR143.h') -Destination (Join-Path $s2 'XPZ3DActorGpuR143.h')
$py=Get-Content -Raw -LiteralPath (Join-Path $parent 's2\build_r142_s2.py')
$py=$py.Replace('r142-terrain','r143-actors').Replace('R142_S2_BUILD_RECEIPT','R143_S2_BUILD_RECEIPT')
$py=$py.Replace('r137.reset_r136_camera','r143.reset_r136_terrain_actors')
[IO.File]::WriteAllText((Join-Path $s2 'build_r143_s2.py'),$py,[Text.UTF8Encoding]::new($false))
Write-Output 'R143_ACTOR_SOURCES_PREPARED'
