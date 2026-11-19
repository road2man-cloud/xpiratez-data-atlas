$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$inv = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\InventoryState.cpp') -Raw -Encoding UTF8
$map = Get-Content -LiteralPath (Join-Path $root 'src\Battlescape\Map.cpp') -Raw -Encoding UTF8
$requiredInventory = @(
  'r164LowTuButton = new TextButton',
  'r164ClearAllButton = new TextButton',
  'add(r164LowTuButton',
  'add(r164ClearAllButton',
  'r164LowTuButton->onMouseClick',
  'r164ClearAllButton->onMouseClick',
  'r164LowTuButton->setText(',
  '_btnAutoAll->setText(',
  'r164ClearAllButton->setText(',
  'r164LowTuMode',
  'costs[m] <= 20',
  'itemDropInventory(',
  'r164ClearAllButton',
  'const int candidatePriority=priority(candidate)',
  'if (rule->isGrenadeOrProxy()) return 1',
  'if (rule->getBattleType() == BT_AMMO) return 2',
  'fitItemToInventory(quickdraw,candidate)',
  'R160B: a physical frag already',
  'new TextEdit(this, 40, 9, 184, 126)'
)
$requiredMap = @('R163: the R162 left-panel FLY MOVE value',
                  'r161KnownFlyingAirCell', 'FLY MOVE ',
                  'tile->getTUMarker()')
foreach ($needle in $requiredInventory) {
  if (-not $inv.Contains($needle)) { throw ('MISSING_INVENTORY_REGRESSION: ' + $needle) }
}
foreach ($needle in $requiredMap) {
  if (-not $map.Contains($needle)) { throw ('MISSING_MAP_REGRESSION: ' + $needle) }
}
$shaInv = (Get-FileHash -LiteralPath (Join-Path $root 'src\Battlescape\InventoryState.cpp') -Algorithm SHA256).Hash
$shaMap = (Get-FileHash -LiteralPath (Join-Path $root 'src\Battlescape\Map.cpp') -Algorithm SHA256).Hash
Write-Output ('INVENTORY_SOURCE_SHA256=' + $shaInv)
Write-Output ('MAP_SOURCE_SHA256=' + $shaMap)
Write-Output 'R164B_SOURCE_REGRESSION=PASS'
