// X-Piratez 2.1 soldier bodies and worn-armor geometry from the same effective
// YAML merge as the modern soldier database. Do not conflate unit tile size
// (Armor::size), height, or the non-rectangular voxel collision loft mask.
const numberOr=(v,fallback)=>v==null||!Number.isFinite(Number(v))?fallback:Math.trunc(Number(v));

function effectiveShape(soldier,armor){
  const height=(key)=>{const override=numberOr(armor?.[key],-1);return override===-1?numberOr(soldier[key],0):override;};
  const standing=height("standHeight"),kneeling=height("kneelHeight");
  const floating=height("floatHeight");
  const size=Math.max(1,numberOr(armor?.size,1));
  return {
    standing,kneeling,floating,size,
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
export {effectiveShape};
