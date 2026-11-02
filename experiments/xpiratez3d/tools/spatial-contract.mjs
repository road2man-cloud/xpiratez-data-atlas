// X-Piratez 3D: stable OXCE tile/voxel -> S2 world/nav coordinates.
// NO native engine, licensed game assets, writable saves, or gameplay mutation.
// Live Stage26 converter is maintained separately; this is its contract/gate.
export const S2_NAV_CELL_M = 0.625;
export const OXCE_VOXELS_PER_TILE = Object.freeze([16, 16, 24]);
export const OXCE_LOFT_SLICES_PER_TILE = 12;
export const S2_NATIVE_MAX_GRID = 255; // SPathPlace X/Y are 8-bit; 256 requires separate bounds audit.

function insist(ok, code, message) {
  if (!ok) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}
function integer(x, lo, hi) {
  return Number.isSafeInteger(x) && x >= lo && x <= hi;
}
function vec2(x) {
  return Array.isArray(x) && x.length === 2 && x.every(Number.isFinite);
}
function mapDimensions(x) {
  return Array.isArray(x) && x.length === 3 && x.every(v => integer(v, 1, 512));
}
function validTile(plan, p) {
  return Array.isArray(p) && p.length === 3 &&
    p.every((n, i) => integer(n, 0, plan.mapSize[i] - 1));
}
function internal(plan) {
  insist(plan?.schema === 'xpz3d.spatial-contract.v1', 'PLAN', 'Invalid spatial conversion plan');
  return plan;
}
function close(a, b, eps = 1e-8) {
  return Math.abs(a - b) < eps;
}
function clipIndex(x, max) {
  // Exact floating boundary is valid in continuous coordinates but never a tile index.
  insist(x >= 0 && x < max, 'BOUNDS', 'Point lies outside source tactical map');
  return Math.floor(x);
}

/**
 * Native S2 currently fixes 0.625m/path cell. Consequently content cells/tile
 * and physical metres/tile CANNOT be independently tuned without engine changes.
 * A larger requested native grid can instead add empty border cells with ZERO
 * stretch of the OXCE content. These are NOT resolution increases.
 */
export function planSpatialConversion({
  mapSize,
  xyTileMeters = 1.25,
  floorMeters = 2.5,
  nativeGrid = null,
  invertY = false,
} = {}) {
  insist(mapDimensions(mapSize), 'MAP_SIZE', 'mapSize must be [width,length,height] of positive integers');
  insist(Number.isFinite(xyTileMeters) && xyTileMeters > 0 &&
    Number.isFinite(floorMeters) && floorMeters > 0, 'SCALE', 'Nonpositive or invalid source tile scale');
  insist(typeof invertY === 'boolean', 'AXIS', 'invertY must be a boolean');
  const nativeCellsPerTileFloat = xyTileMeters / S2_NAV_CELL_M;
  const cellsPerTile = Math.round(nativeCellsPerTileFloat);
  insist(cellsPerTile >= 1 && cellsPerTile <= 16 &&
    close(nativeCellsPerTileFloat, cellsPerTile), 'NONINTEGER_NAV_RATIO',
    'Tile pitch / S2 path step is fractional: would misalign floors, doors and spawn cells. ' +
    'Choose integer cells/tile, pad the larger grid, or modify the native S2 path step explicitly.');
  const contentCells = [mapSize[0] * cellsPerTile, mapSize[1] * cellsPerTile];
  const dims = nativeGrid ?? contentCells;
  insist(vec2(dims) && dims.every(n => integer(n, 1, S2_NATIVE_MAX_GRID)),
    'NATIVE_LIMIT', 'S2 native grid must fit 8-bit per-axis coordinates, 1..255');
  insist(dims.every((n, i) => n >= contentCells[i]), 'NATIVE_CROP',
    'Native navigation grid would truncate source map; use a smaller physical tile pitch or split the world');
  const extra = dims.map((v, i) => v - contentCells[i]);
  const left = Math.floor(extra[0] / 2), right = extra[0] - left;
  const top = Math.floor(extra[1] / 2), bottom = extra[1] - top;
  return {
    schema: 'xpz3d.spatial-contract.v1',
    mapSize: [...mapSize],
    axis: {x: 'source x increases with S2 x',
      y: invertY ? 'source y reversed in S2 y' : 'source y increases with S2 y',
      nativeDirectionIndexCalibrated: false, invertY},
    voxel: {perTile: [...OXCE_VOXELS_PER_TILE], loftSlicesPerTile: OXCE_LOFT_SLICES_PER_TILE,
      widthMeters: xyTileMeters / 16, heightMeters: floorMeters / 24,
      loftSliceMeters: floorMeters / OXCE_LOFT_SLICES_PER_TILE},
    xyTileMeters, floorMeters, s2CellMeters: S2_NAV_CELL_M,
    cellsPerTile, contentCells,
    nativeGrid: [...dims],
    marginsCells: {left, right, top, bottom},
    contentOriginMeters: [left * S2_NAV_CELL_M, top * S2_NAV_CELL_M, 0],
    contentExtentMeters: [mapSize[0] * xyTileMeters, mapSize[1] * xyTileMeters,
      mapSize[2] * floorMeters],
    gridExtentMeters: dims.map(v => v * S2_NAV_CELL_M),
    // Explicitly prevent declaring a larger grid to be higher spatial resolution.
    enlargedGridIsPaddingOnly: extra.some(v => v !== 0),
    sourceToNavRequiresNativePassability: true,
    originalScaleAndFacingCalibrationPending: true,
  };
}

// Coordinates use a single scene origin. Geometry is expressed at source tile
// boundaries; an actor intent uses the actual center (not a made-up path node).
export function tileToWorld(plan, tile, {anchor = [0.5, 0.5], offsetZ = 0} = {}) {
  internal(plan);
  insist(validTile(plan, tile), 'TILE_BOUNDS', 'Source tile out of battle map bounds');
  insist(vec2(anchor) && anchor.every(v => v >= 0 && v <= 1) &&
    Number.isFinite(offsetZ), 'ANCHOR', 'Invalid source-local anchor');
  const [x, y, z] = tile, [ax, ay] = anchor;
  const sy = plan.axis.invertY ? plan.mapSize[1] - y - ay : y + ay;
  return [
    plan.contentOriginMeters[0] + (x + ax) * plan.xyTileMeters,
    plan.contentOriginMeters[1] + sy * plan.xyTileMeters,
    z * plan.floorMeters + offsetZ,
  ];
}

export function voxelToWorld(plan, tile, voxel) {
  internal(plan);
  insist(Array.isArray(voxel) && voxel.length === 3 &&
    voxel.every((x, i) => Number.isFinite(x) && x >= 0 && x <= OXCE_VOXELS_PER_TILE[i]),
    'VOXEL_BOUNDS', 'Voxel point must be within one tile [0..16,0..16,0..24]');
  return tileToWorld(plan, tile, {anchor: [voxel[0] / 16, voxel[1] / 16],
    offsetZ: voxel[2] / 24 * plan.floorMeters});
}

export function worldToTile(plan, world) {
  internal(plan);
  insist(Array.isArray(world) && world.length === 3 &&
    world.every(Number.isFinite), 'WORLD', 'world coordinate must have 3 finite values');
  const xr = (world[0] - plan.contentOriginMeters[0]) / plan.xyTileMeters;
  const yr = (world[1] - plan.contentOriginMeters[1]) / plan.xyTileMeters;
  const ys = plan.axis.invertY ? plan.mapSize[1] - yr : yr;
  return [clipIndex(xr, plan.mapSize[0]), clipIndex(ys, plan.mapSize[1]),
    clipIndex(world[2] / plan.floorMeters, plan.mapSize[2])];
}
function navCellWorld(plan, x, y, z = 0) {
  return [(x + 0.5) * plan.s2CellMeters, (y + 0.5) * plan.s2CellMeters, z];
}

/**
 * Even cells/tile means a source tile CENTER lies between four S2 cell
 * centers, never at one cell center. Return ALL native candidates instead of
 * silently rounding and pretending the actor is at the source center.
 */
export function tileNavCandidates(plan, tile) {
  internal(plan);
  insist(validTile(plan, tile), 'TILE_BOUNDS', 'Source tile out of bounds');
  const [x, y, z] = tile, k = plan.cellsPerTile;
  const bx = plan.marginsCells.left + k * x;
  const by = plan.marginsCells.top + k * (plan.axis.invertY ? plan.mapSize[1] - 1 - y : y);
  const ideal = tileToWorld(plan, tile);
  const cells = [];
  for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
    const cx = bx + dx, cy = by + dy;
    const center = navCellWorld(plan, cx, cy, ideal[2]);
    cells.push({cell: [cx, cy], world: center,
      horizontalErrorMeters: Math.hypot(center[0] - ideal[0], center[1] - ideal[1]),
      nativePassabilityChecked: false});
  }
  cells.sort((a, b) => a.horizontalErrorMeters - b.horizontalErrorMeters ||
    a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]);
  return {sourceTile: [...tile], idealCenterMeters: ideal, candidates: cells,
    nativePathLayerResolved: false, selectedCell: null};
}

export function footprintToNativeCells(plan, tile, footprint = [1, 1]) {
  internal(plan);
  insist(validTile(plan, tile) && vec2(footprint) &&
    footprint.every(n => integer(n, 1, 32)), 'FOOTPRINT', 'Invalid footprint or origin tile');
  insist(tile[0] + footprint[0] <= plan.mapSize[0] &&
    tile[1] + footprint[1] <= plan.mapSize[1], 'FOOTPRINT_BOUNDS', 'Source footprint exceeds map');
  const first = tileNavCandidates(plan, tile).candidates;
  const last = tileNavCandidates(plan, [
    tile[0] + footprint[0] - 1, tile[1] + footprint[1] - 1, tile[2]]).candidates;
  const positions = [...first, ...last].map(c => c.cell);
  const xs = positions.map(x => x[0]), ys = positions.map(x => x[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {sourceTile: [...tile], sourceFootprintTiles: [...footprint],
    nativeRectCells: [minX, minY, footprint[0] * plan.cellsPerTile,
      footprint[1] * plan.cellsPerTile],
    physicalDimensionsMeters: [footprint[0] * plan.xyTileMeters,
      footprint[1] * plan.xyTileMeters],
    // The origin source tile is the footprint corner, not the center.
    intendedCenterMeters: [(minX + footprint[0] * plan.cellsPerTile / 2) * plan.s2CellMeters,
      (minY + footprint[1] * plan.cellsPerTile / 2) * plan.s2CellMeters,
      tile[2] * plan.floorMeters],
    // S2 unit collision radius/height and model scale must come from ruleset
    // and real 3D model bounds; NEVER inferred from map cells alone.
    s2CollisionProfileMapped: false, modelScaleMapped: false};
}

export function facingVector(plan, oxceDirection) {
  internal(plan);
  insist(integer(oxceDirection, 0, 7), 'FACING', 'OXCE direction index must be 0..7');
  // OXCE conventions: 0 north, clockwise. World-axis mapping is explicit;
  // S2 orientation indices require a native calibration test.
  const rad = oxceDirection * Math.PI / 4;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  return {world: [Math.abs(dx) < 1e-12 ? 0 : dx,
    Math.abs(dy) < 1e-12 ? 0 : plan.axis.invertY ? -dy : dy],
    s2DirectionIndex: null, calibrationVerified: false};
}

export function projectUnit(plan, unit, {footprintTiles = null} = {}) {
  internal(plan);
  insist(unit && Number.isSafeInteger(unit.unitId) && unit.unitId >= 0,
    'UNIT_ID', 'Unit missing stable source identifier');
  if (unit.tile == null) return {
    unitId: unit.unitId, state: 'NOT_DEPLOYED_OR_NO_TILE',
    sourceUnitRule: unit.unitRule ?? null, sourceArmorRule: unit.armorRule ?? null,
    s2ActorCreated: false};
  insist(validTile(plan, unit.tile), 'UNIT_TILE', 'Unit tile is outside source battle extents');
  const place = tileNavCandidates(plan, unit.tile);
  const footprint = footprintTiles ? footprintToNativeCells(plan, unit.tile, footprintTiles) : null;
  const ideal = footprint ? footprint.intendedCenterMeters : place.idealCenterMeters;
  let candidates = place.candidates;
  if (footprint) {
    const [left, top, width, height] = footprint.nativeRectCells;
    candidates = [];
    for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++){
      const world=[(x+0.5)*plan.s2CellMeters,(y+0.5)*plan.s2CellMeters,ideal[2]];
      candidates.push({cell:[x,y],world,
        horizontalErrorMeters:Math.hypot(world[0]-ideal[0],world[1]-ideal[1]),
        nativePassabilityChecked:false});
    }
    candidates.sort((a,b)=>a.horizontalErrorMeters-b.horizontalErrorMeters ||
      a.cell[1]-b.cell[1] || a.cell[0]-b.cell[0]);
  }
  return {
    unitId: unit.unitId, unitKey: unit.unitKey ?? 'unit:' + unit.unitId,
    faction: unit.faction, state: 'CANDIDATES_ONLY',
    sourceUnitRule: unit.unitRule ?? null, sourceArmorRule: unit.armorRule ?? null,
    sourceTile: [...unit.tile], sourceTileAnchorWorldMeters:place.idealCenterMeters,
    intendedWorldMeters: [...ideal],
    s2CandidateCells: candidates.map(x => ({...x, cell: [...x.cell], world: [...x.world]})),
    footprint, facing: unit.facing == null ? null : facingVector(plan, unit.facing),
    visualModelMapped: false, s2ColliderMapped: false, nativeSpawnVerified: false,
    requiresNativeGroundHeightAndPassability: true,
  };
}

export const OXCE_TILE_PARTS = Object.freeze(['floor', 'westWall', 'northWall', 'object']);
export function tilePartReference({battleId, tile, part, dataset, mcdId,
  state = 'unknown'}) {
  insist(typeof battleId === 'string' && battleId.length >= 8, 'BATTLE_ID', 'Missing battle identity');
  insist(Array.isArray(tile) && tile.length === 3 &&
    tile.every(v => Number.isSafeInteger(v) && v >= 0), 'TILE', 'Invalid part tile');
  insist(integer(part, 0, 3) && typeof dataset === 'string' && dataset.length > 0 &&
    integer(mcdId, 0, 65535), 'PART', 'Missing source MCD identity');
  insist(typeof state === 'string', 'STATE', 'Invalid source dynamic state');
  // Stable tile/part identity survives MCD destruction-state transitions.
  // Source geometry (dataset/MCD ID) may change without changing the object slot.
  return {sourceRef: [battleId, tile.join(','), 'part' + part].join('/'),
    definitionRef:dataset + ':' + mcdId,
    tile: [...tile], part, partKind: OXCE_TILE_PARTS[part],
    dataset, mcdId, sourceState: state,
    distinctVisualAndCollisionRequired: true,
    destructionUnit: 'source tile part, NOT aggregate material chunk',
    allowsRendererReplacementWithoutChangingNativeCollision: true};
}

export function auditExistingTerrainManifest(plan, manifest) {
  internal(plan);
  insist(manifest?.schema === 'xpz3d.oxce-terrain-mesh.v1', 'TERRAIN_SCHEMA',
    'Not a Stage26 terrain manifest');
  insist(JSON.stringify(manifest.source?.mapSize) === JSON.stringify(plan.mapSize),
    'TERRAIN_MAP', 'Manifest map differs from plan');
  const actual = manifest.conversion || {};
  insist(Number.isFinite(actual.sourceTileMeters) && actual.sourceTileMeters > 0 &&
    Number.isFinite(actual.s2CellMeters) && actual.s2CellMeters > 0 &&
    Array.isArray(actual.s2Grid) && actual.s2Grid.length === 2,
    'TERRAIN_SCALE', 'Manifest missing spatial dimensions');
  const stretching = actual.sourceTileMeters / plan.xyTileMeters;
  const expands = stretching > 1 + 1e-7 || stretching < 1 - 1e-7;
  const actualArea = (plan.mapSize[0] * actual.sourceTileMeters) *
    (plan.mapSize[1] * actual.sourceTileMeters);
  const plannedArea = plan.contentExtentMeters[0] * plan.contentExtentMeters[1];
  return {schema: 'xpz3d.spatial-audit.v1', battleId: manifest.source.battleId ?? null,
    actualTileMeters: actual.sourceTileMeters, plannedTileMeters: plan.xyTileMeters,
    xyContentLinearRatio: stretching, xyAreaRatio: actualArea / plannedArea,
    actualNativeGrid: [...actual.s2Grid], plannedNativeGrid: [...plan.nativeGrid],
    sourceWorldSizePreserved: !expands,
    nativeGridMatches: JSON.stringify(actual.s2Grid) === JSON.stringify(plan.nativeGrid),
    stretchMismatchMeters: actual.sourceTileMeters - plan.xyTileMeters,
    warnings: [...(expands ? ['SCALE_STRETCH: visual and physical map width changed'] : []),
      ...(!close(actual.floorHeightMeters, plan.floorMeters) ?
        ['VERTICAL_SCALE_MISMATCH'] : []),
      ...(!close(actual.s2CellMeters, plan.s2CellMeters) ?
        ['NATIVE_CELL_MISMATCH'] : []),
      ...(actual.oxceMcdRulesetPatchesApplied !== true ?
        ['MCD_RULESET_OVERRIDES_NOT_APPLIED'] : []),
      ...(actual.exactSpriteTextures !== true ? ['VISUAL_TEXTURES_NOT_IMPORTED'] : [])],
  };
}
