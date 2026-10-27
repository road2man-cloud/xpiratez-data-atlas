// X-Piratez 2.1 soldier bodies and worn-armor geometry from the same effective
// YAML merge as the modern soldier database. Do not conflate unit tile size
// (Armor::size), height, or the non-rectangular voxel collision loft mask.
const numberOr=(v,fallback)=>v==null||!Number.isFinite(Number(v))?fallback:Math.trunc(Number(v));
// Armor::loftempsSet is an array of collision-template IDs, NOT a voxel width.
// If the armor does not declare one, preserve unknown rather than assuming a hitbox.
function loftTemplates(armor){
  if(Array.isArray(armor?.loftempsSet)&&armor.loftempsSet.length)
    return armor.loftempsSet.filter(x=>Number.isInteger(x));
  const legacy=numberOr(armor?.loftemps,-1);
  return legacy>=0?[legacy]:[];
}

function effectiveShape(soldier,armor){
  const height=(key)=>{const override=numberOr(armor?.[key],-1);return override===-1?numberOr(soldier[key],0):override;};
  const standing=height("standHeight"),kneeling=height("kneelHeight");
  const floating=height("floatHeight");
  const size=Math.max(1,numberOr(armor?.size,1));
  return {
    standing,kneeling,floating,size,
    loftempsSet:loftTemplates(armor),
    // TileEngine::getOriginVoxel: standing/kneeling height + floating - 4
    // for non-throw projectiles on level ground (no terrain adjustment).
    standingShotOrigin:standing+floating-4,
    kneelingShotOrigin:kneeling+floating-4,
    allowsKneeling:typeof armor?.allowsKneeling==="boolean"?armor.allowsKneeling:null
  };
}

export function buildSoldierVoxelReference({effectiveMerged,sourceHistory,tr}){
  const rules=(Array.isArray(effectiveMerged.soldiers)?effectiveMerged.soldiers:[])
    .filter(x=>typeof x?.type==="string");
  const ids=new Set(rules.map(x=>x.type));
  const armors=(Array.isArray(effectiveMerged.armors)?effectiveMerged.armors:[])
    .filter(x=>typeof x?.type==="string");
  const byArmor=new Map(armors.map(x=>[x.type,x]));
  const defaultArmorIds=new Set(rules.map(x=>x.armor).filter(Boolean));
  const soldiers=rules.map(s=>{
    const armor=byArmor.get(s.armor);
    const base={standing:numberOr(s.standHeight,0),
      kneeling:numberOr(s.kneelHeight,0),floating:numberOr(s.floatHeight,0)};
    return {
      id:s.type,koName:tr(s.type,"ko"),enName:tr(s.type,"en"),
      base,defaultArmor:s.armor??null,
      defaultShape:effectiveShape(s,armor),
      sourceFiles:sourceHistory["type:"+s.type]||[],
      defaultArmorResolved:!!armor
    };
  }).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));
  const wearable=armors.filter(a=>
    defaultArmorIds.has(a.type)||(Array.isArray(a.units)&&a.units.some(id=>ids.has(id)))
  ).map(a=>{
    const types=(Array.isArray(a.units)?a.units:[]).filter(id=>ids.has(id));
    // Include the soldier's actual starter armor even if its units list does
    // not explicitly declare that soldier (it is set by RuleSoldier::armor).
    for(const s of rules)if(s.armor===a.type&&!types.includes(s.type))types.push(s.type);
    return {
      id:a.type,koName:tr(a.type,"ko"),enName:tr(a.type,"en"),
      soldierTypes:types.sort(),
      standHeightOverride:numberOr(a.standHeight,-1),
      kneelHeightOverride:numberOr(a.kneelHeight,-1),
      floatHeightOverride:numberOr(a.floatHeight,-1),
      size:Math.max(1,numberOr(a.size,1)),
      loftempsSet:loftTemplates(a),
      allowsKneeling:typeof a.allowsKneeling==="boolean"?a.allowsKneeling:null,
      sourceFiles:sourceHistory["type:"+a.type]||[]
    };
  }).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));
  return {
    tile:{x:16,y:16,z:24},
    shotOriginFormula:"getHeight() + getFloatHeight() - terrainLevel - 4",
    notes:"Height is a vertical extent, not a rectangular hitbox. Actual collision is checked against the unit's armor loft masks and shot dispersion.",
    soldiers,armors:wearable,
    counts:{soldiers:soldiers.length,wearableArmors:wearable.length}
  };
}
// GEODATA/LOFTEMPS.DAT stores one 16×16 bitmask per 32-byte template:
// 16 little-endian 16-bit rows, with bit (15-x) representing column x.
// TileEngine::voxelCheck() repeats that mask through the unit's stance height.
// These are exact horizontal collision voxels, not approximate sprite width.
export function decodeCollisionTemplates(bytes,templateIds){
  if(!bytes||bytes.length%32!==0)
    throw new Error("Invalid LOFTEMPS.DAT: expected a multiple of 32 bytes");
  const total=bytes.length/32, result={};
  for(const id of [...new Set(templateIds)].sort((a,b)=>a-b)){
    if(!Number.isInteger(id)||id<0||id>=total)
      throw new Error("Collision template outside LOFTEMPS.DAT: "+id);
    let xMin=16,xMax=-1,yMin=16,yMax=-1,occupied=0;
    for(let y=0;y<16;y++){
      const offset=id*32+y*2;
      const bits=bytes[offset]|(bytes[offset+1]<<8);
      for(let x=0;x<16;x++){
        if(!(bits & (1<<(15-x))))continue;
        occupied++; xMin=Math.min(xMin,x); xMax=Math.max(xMax,x);
        yMin=Math.min(yMin,y); yMax=Math.max(yMax,y);
      }
    }
    result[id]={width:xMax<0?0:xMax-xMin+1,depth:yMax<0?0:yMax-yMin+1,
      occupied,xMin:xMax<0?null:xMin,xMax:xMax<0?null:xMax,
      yMin:yMax<0?null:yMin,yMax:yMax<0?null:yMax};
  }
  return result;
}
// The 2×2 four-template order is translated by TileEngine::voxelCheck:
// tile cells (x0,y0),(x1,y0),(x0,y1),(x1,y1) map to [1,0,3,2].
// x is mirrored in the collision test; this changes left/right location but
// not the bounding width, occupied count, or footprint fill measured here.
export function collisionFootprint(armor, templates) {
  const size=armor.size, ids=armor.loftempsSet;
  if(!Number.isInteger(size)||size<1||size>2||ids.length!==size*size)
    throw new Error("Unsupported armor footprint: "+armor.id);
  let occupied=0,xMin=Infinity,xMax=-1,yMin=Infinity,yMax=-1;
  for(let ty=0;ty<size;ty++)for(let tx=0;tx<size;tx++){
    const tileIndex=tx+ty*size;
    const part=size===2?[1,0,3,2][tileIndex]:tileIndex;
    const mask=templates[ids[part]];
    if(!mask)throw new Error("Missing collision template "+ids[part]+" for "+armor.id);
    occupied+=mask.occupied;
    if(mask.occupied===0)continue;
    xMin=Math.min(xMin,tx*16+15-mask.xMax);
    xMax=Math.max(xMax,tx*16+15-mask.xMin);
    yMin=Math.min(yMin,ty*16+mask.yMin);
    yMax=Math.max(yMax,ty*16+mask.yMax);
  }
  const gridWidth=16*size, gridDepth=16*size, possible=gridWidth*gridDepth;
  return {
    gridWidth,gridDepth,
    boundsWidth:xMax<0?0:xMax-xMin+1,
    boundsDepth:yMax<0?0:yMax-yMin+1,
    occupiedPerLayer:occupied,possiblePerLayer:possible,
    coveragePercent:Math.round((occupied/possible)*1e4)/100
  };
}
export {effectiveShape};
