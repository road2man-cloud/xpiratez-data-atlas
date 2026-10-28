#!/usr/bin/env node
// X-Piratez lightweight surrogate: independent approximate model, NOT the OXCE engine.
// Only built-in Node.js modules. Tested through node --test test.mjs.
import fs from 'node:fs';
import path from 'node:path';

export function parseSave(src) {
  const sections = { units: [], items: [] };
  let section = '', item = null, stats = false, battle = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^---\s*$/.test(line)) { battle = true; continue; }
    if (!battle) continue;
    const top = /^  ([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (top) { section = top[1]; item = null; stats = false; continue; }
    if (section !== 'units' && section !== 'items') continue;
    const fresh = /^    - id:\s*(\d+)/.exec(line);
    if (fresh) {
      item = { id: Number(fresh[1]) };
      sections[section].push(item);
      stats = false;
      continue;
    }
    if (!item) continue;
    const parent = /^      ([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (parent) {
      stats = parent[1] === 'currStats';
      if (!stats) item[parent[1]] = scalar(parent[2]);
    } else if (stats) {
      const child = /^        ([A-Za-z]\w*):\s*(.*)$/.exec(line);
      if (child) item['stat_' + child[1]] = scalar(child[2]);
    }
  }
  if (!sections.units.length) throw new Error('No battle units: not a tactical .sav or unsupported layout');
  const weaponSlots = new Set(['STR_RIGHT_HAND','STR_LEFT_HAND']);
  const itemsByOwner = new Map();
  for (const v of sections.items) {
    if (v.owner == null) continue;
    if (!itemsByOwner.has(v.owner)) itemsByOwner.set(v.owner, []);
    itemsByOwner.get(v.owner).push(v);
  }
  for (const u of sections.units) {
    u.equipment = itemsByOwner.get(u.id) || [];
    u.weapon = u.equipment.find(i => weaponSlots.has(i.inventoryslot) && !i.type.startsWith('INV_NULL_'))?.type
      || u.equipment.find(i => /^STR_/.test(i.type) && /(GUN|RIFLE|SMG|GAUSS|LAUNCHER|PISTOL|BOW|BATON|MP$|SKORPION)/.test(i.type))?.type || '';
  }
  const meta = Object.fromEntries([...src.matchAll(/^  (missionType|totalTiles|tileTotalBytesPer|turn):\s*(.*)$/gm)].map(m => [m[1], scalar(m[2])]));
  meta.mapdatasets = [];
  const ds = /^  mapdatasets:\s*\n((?:    - .*\n?)+)/m.exec(src);
  if (ds) meta.mapdatasets = [...ds[1].matchAll(/^    - ([^\r\n]+)/gm)].map(m=>m[1].trim());
  const b = /^  binTiles:\s*([A-Za-z0-9+/=]+)/m.exec(src);
  meta.binTiles = b?.[1] || null;
  return {...sections, meta};
}
function scalar(s) {
  if (/^-?\d+$/.test(s)) return Number(s);
  const nums = /^\[\s*-?\d+(?:\s*,\s*-?\d+)*\s*\]$/.test(s);
  if (nums) return s.slice(1,-1).split(',').map(v=>Number(v.trim()));
  return s.replace(/^["']|["']$/g, '');
}
export function loadTerrain(save, root, loftPath) {
  if (!root || !loftPath || !save.meta.binTiles) return null;
  const loft = fs.readFileSync(loftPath);
  const models = save.meta.mapdatasets.map(name => {
    const candidates = [path.join(root, name + '.MCD'), path.join(root, name + '.mcd')];
    const found = candidates.find(f => fs.existsSync(f));
    if (!found) throw new Error('Missing MCD: ' + name + ' in ' + root);
    const b = fs.readFileSync(found);
    if (b.length % 62) throw new Error('Unexpected MCD record size in ' + found);
    return Array.from({length:b.length/62},(_,i) => Array.from(b.subarray(i*62+8,i*62+20)));
  });
  const raw = Buffer.from(save.meta.binTiles,'base64');
  if (raw.length % 23) throw new Error('Unexpected serialized tile length');
  const tiles = new Map();
  for (let o=0;o<raw.length;o+=23) {
    const index = raw.readUInt32LE(o);
    const ids = Array.from({length:4},(_,i)=>raw.readInt16LE(o+4+i*2));
    const sets = Array.from({length:4},(_,i)=>raw.readInt16LE(o+12+i*2));
    tiles.set(index,{ids,sets,flags:raw[o+22]});
  }
  return {tiles,models,loft,width:50,height:50,levels:7,loftPatterns:loft.length/32};
}
export function terrainVoxel(world,x,y,z) {
  if (!world) return false;
  if (x<0 || y<0 || z<0 || x>=800 || y>=800 || z>=168) return true;
  const tx=x>>4, ty=y>>4, tz=Math.floor(z/24);
  const t=world.tiles.get(tx+ty*50+tz*2500);
  if (!t) return false;
  const layer=Math.floor((z%24)/2), row=y%16, bit=1<<(15-x%16);
  for (let i=0;i<4;i++) {
    if (t.ids[i]<0 || t.sets[i]<0) continue;
    const loftId=world.models[t.sets[i]]?.[t.ids[i]]?.[layer];
    if (loftId == null || loftId<0) continue;
    const offset=loftId*32 + row*2;
    if (offset+2<=world.loft.length && (world.loft.readUInt16LE(offset)&bit)) return true;
  }
  return false;
}
export function clearLine(world,a,b) {
  if (!world) return null; // unknown, NEVER treat as certified clear
  const va=[a.position[0]*16+8,a.position[1]*16+8,a.position[2]*24+17];
  const vb=[b.position[0]*16+8,b.position[1]*16+8,b.position[2]*24+14];
  const diff=va.map((v,i)=>vb[i]-v),n=Math.max(...diff.map(Math.abs));
  for(let i=2;i<n-2;i++){
    const p=va.map((v,j)=>Math.round(v+diff[j]*i/n));
    if(terrainVoxel(world,...p)) return false;
  }
  return true;
}
function rng(seed) {
  let x=(seed>>>0)||1;
  return ()=> {x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
function distance(a,b) {
  return Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1],(a.position[2]-b.position[2])*2);
}
function weapon(item) {
  if (/HEAVY_GAUSS/.test(item)) return {power:120,acc:0.50,shots:2,range:30};
  if (/GAUSS_SNIPER/.test(item)) return {power:90,acc:0.73,shots:1,range:43};
  if (/GAUSS_RIFLE/.test(item)) return {power:100,acc:0.65,shots:1,range:32};
  if (/SMALL_LAUNCHER/.test(item)) return {power:50,acc:0.65,shots:1,range:25,stun:true};
  if (/SSRL_2/.test(item)) return {power:90,acc:0.65,shots:1,range:24};
  if (/SMG_10MM/.test(item)) return {power:35,acc:0.55,shots:5,range:20};
  if (/SKORPION/.test(item)) return {power:23,acc:0.5,shots:4,range:14};
  if (/^STR_MP$/.test(item)) return {power:30,acc:0.55,shots:4,range:22};
  if (/BOW/.test(item)) return {power:30,acc:0.50,shots:1,range:18};
  if (/PISTOL/.test(item)) return {power:35,acc:0.5,shots:1,range:20};
  if (/CHRYSSALID/.test(item)) return {power:75,acc:0.85,shots:1,range:1.8};
  if (/CELATID/.test(item)) return {power:45,acc:0.6,shots:1,range:15};
  return {power:28,acc:0.45,shots:1,range:12};
}
function unitCopy(u) {
  return {id:u.id,faction:u.faction,position:[...u.position],health:u.health,remaining:u.health,
    armor:Array.isArray(u.armor)?u.armor:[0],firing:u.stat_firing||45,tu:u.tu,
    type:u.genUnitType||'',weapon:u.weapon||(u.genUnitType?.includes('CHRYSSALID')?'CHRYSSALID':u.genUnitType?.includes('CELATID')?'CELATID':''),
    down:false};
}
function resolveFire(actor,target,random,world) {
  const d=distance(actor,target),w=weapon(actor.weapon);
  if (d>w.range) return false;
  const line=clearLine(world,actor,target);
  if (line===false) return false;
  const hit=Math.max(0.025,Math.min(0.92,w.acc*(0.60+actor.firing/250)*Math.max(0.18,1-d/(w.range*1.8))));
  for(let i=0;i<w.shots;i++) {
    if (random()>=hit) continue;
    const face=target.armor[0]||0;
    const reduction=w.stun ? face*0.25 : face;
    const damage=Math.max(0,Math.floor(w.power*(0.45+0.85*random())-reduction));
    target.remaining-=damage;
    if(target.remaining<=0){target.down=true;break;}
  }
  return true;
}
function stepToward(actor,target,units,world,steps) {
  for (let i=0;i<steps;i++) {
    const prev=distance(actor,target);let best=null;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const p=[actor.position[0]+dx,actor.position[1]+dy,actor.position[2]];
      if(p[0]<0||p[0]>=50||p[1]<0||p[1]>=50)continue;
      if(units.some(v=>!v.down&&v!==actor&&v.position.join()==p.join()))continue;
      if(world && terrainVoxel(world,p[0]*16+8,p[1]*16+8,p[2]*24+10))continue;
      const d=distance({position:p},target);
      if(d<prev&&(!best||d<best.d))best={p,d};
    }
    if(!best)break;
    actor.position=best.p;
  }
}
export function battle(save,{seed=1,strategy='suppress',turnLimit=14,world=null}={}) {
  const random=rng(seed),u=save.units.map(unitCopy);
  const team=u.filter(x=>x.faction===0),foe=u.filter(x=>x.faction===1);
  let turn=0,events=[];
  const threat=x=>/LAUNCHER/.test(x.weapon)?12:/HEAVY_GAUSS/.test(x.weapon)?10:/GAUSS/.test(x.weapon)?7:/CHRYSSALID/.test(x.type)?6:1;
  for (turn=1;turn<=turnLimit;turn++) {
    for(const a of team.filter(x=>!x.down)){
      const candidates=foe.filter(x=>!x.down).sort((x,y)=>{
        const sx=(strategy==='suppress'?threat(x)*6:0)-distance(a,x);
        const sy=(strategy==='suppress'?threat(y)*6:0)-distance(a,y);
        return sy-sx;
      });
      const target=candidates.find(x=>distance(a,x)<=weapon(a.weapon).range&&clearLine(world,a,x)!==false);
      if(target)resolveFire(a,target,random,world);
      else if(strategy==='push'&&candidates.length)stepToward(a,candidates[0],u,world,3);
    }
    for(const e of foe.filter(x=>!x.down)){
      const candidates=team.filter(x=>!x.down).sort((x,y)=>distance(e,x)-distance(e,y));
      if(!candidates.length)break;
      const target=candidates.find(x=>distance(e,x)<=weapon(e.weapon).range&&clearLine(world,e,x)!==false);
      if(target)resolveFire(e,target,random,world);
      else stepToward(e,candidates[0],u,world,Math.max(1,Math.floor(e.tu/25)));
    }
    events.push({turn,alliesAlive:team.filter(x=>!x.down).length,enemiesAlive:foe.filter(x=>!x.down).length});
    if(team.every(x=>x.down)||foe.every(x=>x.down))break;
  }
  const alive=team.filter(x=>!x.down).length, enemies=foe.filter(x=>!x.down).length;
  return {seed,strategy,turn:Math.min(turn,turnLimit),alliesAlive:alive,enemiesAlive:enemies,
    victory:enemies===0 && alive>0, flawless:enemies===0 && alive===team.length,
    hpLoss:team.reduce((s,x)=>s+Math.max(0,x.health-Math.max(0,x.remaining)),0),events};
}
export function experiment(save,{runs=1000,seed=1,strategies=['suppress','push','hold'],turnLimit=14,world=null}={}) {
  if(!Number.isSafeInteger(runs)||runs<1||runs>1000000)throw new Error('runs out of range');
  const results=[];
  for(const strategy of strategies) {
    let victories=0,flawless=0,losses=0,dead=0,best=null;
    for(let i=0;i<runs;i++) {
      const r=battle(save,{seed:(seed+i)>>>0,strategy,turnLimit,world});
      victories+=Number(r.victory);flawless+=Number(r.flawless);losses+=r.hpLoss;dead+=save.units.filter(u=>u.faction===0).length-r.alliesAlive;
      if(!best || (r.victory&&!best.victory) || (r.victory===best.victory&&r.alliesAlive>best.alliesAlive)
        || (r.victory===best.victory&&r.alliesAlive===best.alliesAlive&&r.hpLoss<best.hpLoss))best=r;
    }
    results.push({strategy,runs,victories,flawless,winRate:victories/runs,flawlessRate:flawless/runs,
      meanHPLoss:losses/runs,meanDeaths:dead/runs,best});
  }
  results.sort((a,b)=>b.flawlessRate-a.flawlessRate||b.winRate-a.winRate||a.meanDeaths-b.meanDeaths||a.meanHPLoss-b.meanHPLoss);
  return {model:'SURROGATE_APPROXIMATION_NOT_OXCE',verifiedFullEngine:false,
    geometry:world?'MCD_LOFT_CENTERLINE_APPROX':'UNAVAILABLE_NO_OCCLUSION_VALIDATION',
    rng:'xorshift32',seed,turnLimit,units:save.units.length,strategies:results};
}
if(process.argv[1] && import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  try {
    const args=process.argv.slice(2);
    if(!args[0] || args.includes('--help')) {
      console.log('Usage: node simulate.mjs BATTLE.sav [--runs 1000] [--seed 1] [--turns 14] [--terrain-dir DIR --loft PATH]');
      process.exit(args[0]?0:2);
    }
    function opt(name,fallback) {const i=args.indexOf(name);return i<0?fallback:args[i+1];}
    const save=parseSave(fs.readFileSync(args[0],'utf8'));
    const terrainDir=opt('--terrain-dir',null),loft=opt('--loft',null);
    if(Boolean(terrainDir)!==Boolean(loft))throw new Error('Supply both --terrain-dir and --loft');
    const world=loadTerrain(save,terrainDir,loft);
    const report=experiment(save,{runs:Number(opt('--runs','1000')),seed:Number(opt('--seed','1')),turnLimit:Number(opt('--turns','14')),world});
    console.log(JSON.stringify(report,null,2));
  }catch(e){console.error('ERROR:',e.message);process.exitCode=1;}
}
