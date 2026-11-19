$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$inv = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\InventoryState.cpp') -Raw -Encoding UTF8
$map = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\Map.cpp') -Raw -Encoding UTF8
$inventoryChecks = @(
'r164LowTuButton->onMouseClick', 'r164ClearAllButton->onMouseClick',
'r164LowTuButton->setText(', 'r164ClearAllButton->setText(',
'_btnAutoAll->setText(', 'r164LowTuMode',
'costs[m] <= 20', 'itemDropInventory(',
'fitItemToInventory(quickdraw,candidate)',
'if (rule->isGrenadeOrProxy()) return 1',
'if (rule->getBattleType() == BT_AMMO) return 2',
'R160B: a physical frag already',
'new TextEdit(this, 40, 9, 184, 126)'
)
$mapChecks = @(
'R165: normal walking and flight',
'WALK MOVE ', 'FLY MOVE ',
'r114HmsRemainingTu(_save, actor, hover',
'r161KnownFlyingAirCell',
'tile->getTUMarker()',
'flyTuOverBudget'
)
foreach($needle in $inventoryChecks) {
 if(-not $inv.Contains($needle)) {throw ('MISSING_INVENTORY: '+$needle)}
}
foreach($needle in $mapChecks) {
 if(-not $map.Contains($needle)) {throw ('MISSING_MAP: '+$needle)}
}
Write-Output 'R165_CUMULATIVE_SOURCE_GUARD=PASS'
