$ErrorActionPreference='Stop'
$header='D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102\source\src\Battlescape\BattlescapeGame.h'
$bytes=[IO.File]::ReadAllBytes($header)
try {
 $s=[IO.File]::ReadAllText($header)
 $anchor='BattlescapeGame(SavedBattleGame *save, BattlescapeState *parentState);'
 if (!$s.Contains($anchor)) {throw 'R205_PARENT_STATE_ANCHOR_MISSING'}
 $s=$s.Replace($anchor,$anchor+[Environment]::NewLine+'    BattlescapeState *getParentState() const { return _parentState; }')
 [IO.File]::WriteAllText($header,$s,[Text.UTF8Encoding]::new($false))
 & (Join-Path $PSScriptRoot 'build_r212.ps1')
 if (!$?) {throw 'R212_BUILD_FAILED'}
} finally {
 [IO.File]::WriteAllBytes($header,$bytes)
}