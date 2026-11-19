$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$inv = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\InventoryState.cpp') -Raw -Encoding UTF8
$map = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\Map.cpp') -Raw -Encoding UTF8
$requiredInv = @(
 'r164LowTuButton->onMouseClick',
 'r164ClearAllButton->onMouseClick',
 'r164LowTuMode', 'costs[m] <= 20',
 'R160B: a physical frag already',
 'if (rule->isGrenadeOrProxy()) return 1',
 'if (rule->getBattleType() == BT_AMMO) return 2',
 'R166: when every alternate pocket is full',
 'quickdraw->fitItemInSlot(candidate->getRules(),qx,qy)',
 'origin->fitItemInSlot(victim->getRules(),originX,originY)',
 'Inventory::overlapItems(',
 'if (exchanged) continue;',
 'new TextEdit(this, 40, 9, 184, 126)'
)
$requiredMap = @('R165: normal walking and flight', 'WALK MOVE ', 'FLY MOVE ', 'r161KnownFlyingAirCell', 'tile->getTUMarker()')
foreach($needle in $requiredInv) { if(-not $inv.Contains($needle)){throw ('REGRESSION_INVENTORY='+$needle)}}
foreach($needle in $requiredMap) { if(-not $map.Contains($needle)){throw ('REGRESSION_MAP='+$needle)}}
Write-Output 'R166_SOURCE_REGRESSION=PASS'
