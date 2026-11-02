#!/usr/bin/env node
// Stage26: actual OXCE battle binTiles + local MCD/LOFT -> polygon instances.
// Script is source-only; licensed game assets are read locally, never committed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {planSpatialConversion} from '../tools/spatial-contract.mjs';
import {extractBattle} from '../stage24/bridge.mjs';
const require=createRequire(import.meta.url);
const yaml=require('js-yaml');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function need(x,s){if(!x)throw Error(s);}
function width(v,d){if(v==null)return d;return typeof v==='string'&&v.length===1?v.charCodeAt(0):Number(v);}
function readNum(b,p,n,sign=false){need(n===1||n===2||n===4,'Unknown byte width');need(p>=0&&p+n<=b.length,'Tile stream truncated');return n===1?b.readUInt8(p):n===2?(sign?b.readInt16LE(p):b.readUInt16LE(p)):b.readUInt32LE(p);}
function asset(game,rel){
  for(const home of [path.join(game,'user','mods','Piratez'),path.join(game,'UFO')]){
    let at=home;if(!fs.existsSync(at))continue;
    for(const section of rel.split('/')){
      const match=fs.readdirSync(at).find(x=>x.toUpperCase()===section.toUpperCase());
      if(!match){at=null;break;}at=path.join(at,match);
    }
    if(at&&fs.statSync(at).isFile())return at;
  }
  throw Error('Missing original game asset: '+rel);
}
export function readBattle(save,battleFile){
  const raw=fs.readFileSync(save), sourceHash=sha(raw);
  const clean=raw.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  const d=yaml.loadAll(clean,{json:true}).find(x=>x&&x.battleGame);
  need(d&&d.battleGame,'Missing generated OXCE battle');
  const b=d.battleGame,dims=[b.width,b.length,b.height];
  need(dims.every(x=>Number.isInteger(x)&&x>0&&x<=512),'Invalid battle extent');
  // Always bind the converted geometry to the Stage24 stable OXCE battle ID
  // and the exact source-save hash, even if --battle was omitted.
  const battle=battleFile?JSON.parse(fs.readFileSync(battleFile,'utf8')):extractBattle(save);
  need(battle.schema==='xpz3d.battle-start.v1'&&battle.origin.sourceSha256===sourceHash,'Battle manifest/save mismatch');
  need(JSON.stringify(dims)===JSON.stringify(battle.mission.mapSize),'Battle map dimensions mismatch');
  const k={index:width(b.tileIndexSize,4),id:width(b.tileIDSize,2),
    set:width(b.tileSetIDSize,2),smoke:width(b.tileSmokeSize,1),
    fire:width(b.tileFireSize,1),bool:width(b.tileBoolFieldsSize,1),
    total:b.tileTotalBytesPer};
  const min=k.index+4*k.id+4*k.set+k.smoke+k.fire+k.bool;
  need(Object.values(k).every(x=>Number.isInteger(x)&&x>0)&&k.total>=min,'Invalid serialized tile key');
  const bytes=Buffer.from(b.binTiles.replace(/\s/g,''),'base64');
  need(bytes.length===b.totalTiles*k.total,'Binary tile record count/size mismatch');
  need(Array.isArray(b.mapdatasets),'Missing map dataset table');
  const tiles=[],used=new Set();
  for(let p=0;p<bytes.length;p+=k.total){
    let cursor=p;
    const index=readNum(bytes,cursor,k.index);cursor+=k.index;
    need(index<dims[0]*dims[1]*dims[2]&&!used.has(index),'Duplicate/out of bounds tile');
    used.add(index);
    const ids=[],sets=[];
    for(let i=0;i<4;i++){ids.push(readNum(bytes,cursor,k.id,true));cursor+=k.id;}
    for(let i=0;i<4;i++){sets.push(readNum(bytes,cursor,k.set,true));cursor+=k.set;}
    const smoke=readNum(bytes,cursor,k.smoke);cursor+=k.smoke;
    const fire=readNum(bytes,cursor,k.fire);cursor+=k.fire;
    const flags=readNum(bytes,cursor,k.bool);
    tiles.push({x:index%dims[0],y:Math.floor(index/dims[0])%dims[1],
      z:Math.floor(index/(dims[0]*dims[1])),ids,sets,smoke,fire,flags});
  }
  return {tiles,dims,terrainSets:b.mapdatasets,sourceHash,
    battleId:battle?.battleId||null,mission:b.missionType,
    unitSpawns:(battle?.units||[]).map(u=>({id:u.unitId,faction:u.faction,tile:u.tile,armorRule:u.armorRule}))};
}
function mcdRecords(file){
  const buf=fs.readFileSync(file);
  need(buf.length>0&&buf.length%62===0,'Invalid MCD record length '+file);
  const rec=[];
  for(let p=0;p<buf.length;p+=62){
    rec.push({loft:[...buf.subarray(p+8,p+20)],frame:buf[p],
      stopLos:buf[p+31],noFloor:buf[p+32],bigWall:buf[p+33],
      gravLift:buf[p+34],door:buf[p+35],armor:buf[p+42],
      heBlock:buf[p+43],die:buf[p+44],terrainLevel:buf.readInt8(p+48),
      part:buf[p+53]});
  }
  return {records:rec,sha:sha(buf)};
}
export function loftMesh(mcd,loft){
  const size=[16,16,12],occ=new Uint8Array(16*16*12);
  let voxels=0;
  for(let z=0;z<12;z++){
    const id=mcd.loft[z];need((id+1)*32<=loft.length,'LOFT ID out of file range: '+id);
    for(let y=0;y<16;y++){
      const bits=loft.readUInt16LE((id*16+y)*2);
      for(let x=0;x<16;x++)if(bits&(1<<(15-x))){occ[(z*16+y)*16+x]=1;voxels++;}
    }
  }
  const isSolid=(x,y,z)=>x>=0&&x<16&&y>=0&&y<16&&z>=0&&z<12?occ[(z*16+y)*16+x]:0;
  const verts=[],tris=[];
  for(let d=0;d<3;d++){
    const u=(d+1)%3,v=(d+2)%3;
    for(let plane=0;plane<=size[d];plane++){
      const mask=new Int8Array(size[u]*size[v]);
      for(let j=0;j<size[v];j++)for(let i=0;i<size[u];i++){
        const a=[0,0,0],b=[0,0,0];
        a[d]=plane-1;b[d]=plane;a[u]=b[u]=i;a[v]=b[v]=j;
        const sa=isSolid(...a),sb=isSolid(...b);
        mask[j*size[u]+i]=sa===sb?0:sa?1:-1;
      }
      for(let j=0;j<size[v];j++)for(let i=0;i<size[u];){
        const sign=mask[j*size[u]+i];
        if(sign===0){i++;continue;}
        let w=1,h=1;
        while(i+w<size[u]&&mask[j*size[u]+i+w]===sign)w++;
        outer:while(j+h<size[v]){
          for(let k=0;k<w;k++)if(mask[(j+h)*size[u]+i+k]!==sign)break outer;
          h++;
        }
        const pt=(p,q)=>{const a=[0,0,0];a[d]=plane;a[u]=p;a[v]=q;return a;};
        const b=verts.length;verts.push(pt(i,j),pt(i+w,j),pt(i+w,j+h),pt(i,j+h));
        if(sign===1)tris.push([b,b+1,b+2],[b,b+2,b+3]);
        else tris.push([b,b+2,b+1],[b,b+3,b+2]);
        for(let jj=0;jj<h;jj++)for(let ii=0;ii<w;ii++)mask[(j+jj)*size[u]+i+ii]=0;
        i+=w;
      }
    }
  }
  return {verts,tris,voxels:voxels*2};
}
function matGroup(name){
  if(/SNOW|ICE|BLANKS/.test(name))return 0;
  if(/FOREST|SWAMP|JUNGLE|TREE/.test(name))return 1;
  if(/ROAD|DUNGEON|STONE/.test(name))return 2;
  if(/PLANE|SHIP|CRASH|INDUS|UFO|URB/.test(name))return 3;
  if(/WOOD|BARN|FARM|HOUSE/.test(name))return 4;
  return 5;
}
const COLORS=[
  [0.84,0.86,0.9],[0.8,0.86,0.9],[0.8,0.86,0.9],[0.62,0.7,0.75],
  [0.34,0.51,0.32],[0.38,0.4,0.3],[0.38,0.4,0.3],[0.41,0.43,0.34],
  [0.5,0.48,0.45],[0.53,0.52,0.5],[0.53,0.52,0.5],[0.44,0.43,0.42],
  [0.50,0.56,0.61],[0.48,0.52,0.58],[0.48,0.52,0.58],[0.45,0.52,0.58],
  [0.55,0.45,0.33],[0.48,0.41,0.35],[0.48,0.41,0.35],[0.48,0.42,0.35],
  [0.56,0.54,0.53],[0.5,0.49,0.48],[0.5,0.49,0.48],[0.5,0.48,0.48]
];
export function makeScene(battle,game,opts={}){
  const [sourceW,sourceH]=battle.dims;
  const region=opts.region||[0,0,sourceW,sourceH],chunk=opts.chunk||6;
  const [rx,ry,rw,rh]=region;
  need(Number.isInteger(chunk)&&chunk>=1&&chunk<=20,'Invalid chunk');
  need([rx,ry,rw,rh].every(Number.isInteger)&&rx>=0&&ry>=0&&rw>0&&rh>0&&rx+rw<=sourceW&&ry+rh<=sourceH,'Invalid crop region');
  // A larger S2 nav grid is PADDING, never an excuse to change the source
  // physical tile pitch. Legacy --scale 120/160 now requests a square grid.
  // Use --grid W,H for proper rectangular map dimensions.
  const spatial=planSpatialConversion({mapSize:battle.dims,
    xyTileMeters:opts.tileMeters??1.25,
    nativeGrid:opts.grid??(opts.scale==null?null:[opts.scale,opts.scale])});
  const spacing=spatial.xyTileMeters;
  const [offsetX,offsetY]=spatial.contentOriginMeters;
  const loftFile=asset(game,'GEODATA/LOFTEMPS.DAT');
  const loft=fs.readFileSync(loftFile);
  need(loft.length>0&&loft.length%32===0,'Invalid LOFTEMPS');
  const datasets=new Map(),shapes=new Map(),batches=new Map(),datasetUse=new Map();
  let refs=0,skippedEmpty=0,openedDoors=0,solidVoxelCount=0;
  for(const t of battle.tiles){
    if(t.x<rx||t.x>=rx+rw||t.y<ry||t.y>=ry+rh)continue;
    for(let part=0;part<4;part++){
      const id=t.ids[part],set=t.sets[part];
      if(id===-1&&set===-1)continue;
      need(id>=0&&set>=0&&set<battle.terrainSets.length,'Bad tile set/index at '+[t.x,t.y,t.z,part]);
      refs++;
      const name=battle.terrainSets[set];
      if(!datasets.has(name))datasets.set(name,mcdRecords(asset(game,'TERRAIN/'+name+'.MCD')));
      const record=datasets.get(name).records[id];
      need(record,'Missing MCD record '+name+'/'+id);
      datasetUse.set(name,(datasetUse.get(name)||0)+1);
      if((part===1&&(t.flags&8))||(part===2&&(t.flags&16))){openedDoors++;continue;}
      const shapeKey=name+':'+id;
      if(!shapes.has(shapeKey))shapes.set(shapeKey,loftMesh(record,loft));
      const shape=shapes.get(shapeKey);
      if(!shape.voxels){skippedEmpty++;continue;}
      solidVoxelCount+=shape.voxels;
      const material=matGroup(name)*4+part;
      const key=[Math.floor(t.x/chunk),Math.floor(t.y/chunk),t.z,material].join(':');
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push({tile:t,part,shape,name,id});
    }
  }
  const meshes=[];
  let allV=0,allT=0,allParts=0;
  for(const [key,instances] of batches){
    const [cx,cy,floor,material]=key.split(':').map(Number);
    let verts=[],tris=[],count=0;
    const flush=()=>{
      if(!verts.length)return;
      meshes.push({cx,cy,floor,material,verts,tris,count});
      allV+=verts.length/3;allT+=tris.length/3;allParts+=count;
      verts=[];tris=[];count=0;
    };
    for(const i of instances){
      if(verts.length/3+i.shape.verts.length>=60000)flush();
      need(i.shape.verts.length<60000,'Oversized single-asset mesh');
      const base=verts.length/3;
      for(const p of i.shape.verts)
        verts.push(offsetX+(i.tile.x+p[0]/16)*spacing,
          offsetY+(i.tile.y+p[1]/16)*spacing,(i.tile.z+p[2]/12)*spatial.floorMeters);
      for(const t of i.shape.tris)tris.push(base+t[0],base+t[1],base+t[2]);
      count++;
    }
    flush();
  }
  const manifest={
    schema:'xpz3d.oxce-terrain-mesh.v1',
    source:{saveSha256:battle.sourceHash,battleId:battle.battleId,mission:battle.mission,
      mapSize:battle.dims,terrainSets:battle.terrainSets,originalTilesDecoded:battle.tiles.length},
    conversion:{region,partial:rx!==0||ry!==0||rw!==sourceW||rh!==sourceH,
      s2Grid:[...spatial.nativeGrid],s2CellMeters:spatial.s2CellMeters,
      sourceTileMeters:spacing,floorHeightMeters:spatial.floorMeters,
      sourceOffsetMeters:[offsetX,offsetY],navMarginCells:spatial.marginsCells,
      scalePolicy:'fixed-source-pitch-grid-padding-only',
      geometry:'MCD LOFT voxel surface greedy meshing',materials:'category flat-color proxies',
      exactSpriteTextures:false,oxceMcdRulesetPatchesApplied:false,
      physicalCollisionVerified:false,highFloorNavigationVerified:false,
      noInventedTowerFloors:true},
    counts:{mapTilePartReferences:refs,meshedPartInstances:allParts,excludedOpenedDoors:openedDoors,
      missingSolidLofts:skippedEmpty,sourceVoxelOccupancy:solidVoxelCount,chunkMeshes:meshes.length,
      vertices:allV,triangles:allT,uniqueMcdShapes:shapes.size},
    localSourceFingerprints:{loftSha256:sha(loft),mcd:[...datasets].map(([name,r])=>({
      name,sha256:r.sha,records:r.records.length,referencedParts:datasetUse.get(name)}))},
    colorMaterials:Object.fromEntries([...new Set(meshes.map(m=>m.material))].map(n=>[n,COLORS[n]])),
    provisionalSpawns:battle.unitSpawns.filter(u=>u.tile&&u.tile[0]>=rx&&u.tile[0]<rx+rw&&u.tile[1]>=ry&&u.tile[1]<ry+rh)
      .map(u=>({unitId:u.id,faction:u.faction,armorRule:u.armorRule,tile:u.tile,
        meters:[offsetX+(u.tile[0]+0.5)*spacing,
          offsetY+(u.tile[1]+0.5)*spacing,u.tile[2]*spatial.floorMeters],
        nativePlacementVerified:false})),
    caveats:['Geometry from actual saved map and LOFT, not a re-authored photoreal art asset',
      'MCD ruleset patch overrides not yet processed; material textures and destruction mapping incomplete',
      'Unit placement and actual imported-map movement require native runtime integration']
  };
  return {meshes,manifest};
}
export function encodeNativeScene(scene){
  const hdr=Buffer.alloc(36);
  hdr.write('XPZ3D26A',0,'ascii');hdr.writeUInt32LE(1,8);
  scene.manifest.source.mapSize.forEach((v,i)=>hdr.writeUInt32LE(v,12+i*4));
  hdr.writeUInt32LE(scene.meshes.length,24);
  hdr.writeFloatLE(scene.manifest.conversion.sourceTileMeters,28);hdr.writeFloatLE(2.5,32);
  const bufs=[hdr];
  for(const m of scene.meshes){
    const nV=m.verts.length/3,nT=m.tris.length/3;
    need(nV>0&&nV<65536&&nT>0&&nT<2000000,'Mesh too large for native S2 WORD triangles');
    const b=Buffer.alloc(36);
    [m.cx,m.cy,m.floor,m.material,nV,nT,m.count,0,0].forEach((v,i)=>b.writeUInt32LE(v,4*i));
    bufs.push(b);
    const vb=Buffer.allocUnsafe(m.verts.length*4);
    m.verts.forEach((v,i)=>vb.writeFloatLE(v,i*4));bufs.push(vb);
    const tb=Buffer.allocUnsafe(m.tris.length*2);
    m.tris.forEach((v,i)=>tb.writeUInt16LE(v,i*2));bufs.push(tb);
  }
  return Buffer.concat(bufs);
}
export function convert(opts){
  need(opts.save&&opts['game-root']&&opts.out,'Required --save --game-root --out');
  const battle=readBattle(opts.save,opts.battle);
  const region=opts.region?opts.region.split(',').map(Number):undefined;
  const grid=opts.grid?opts.grid.split(',').map(Number):null;
  const scene=makeScene(battle,opts['game-root'],{region,
    chunk:opts.chunk==null?6:Number(opts.chunk),
    grid,scale:opts.scale==null?null:Number(opts.scale),
    tileMeters:opts['tile-meters']==null?1.25:Number(opts['tile-meters'])});
  const binary=encodeNativeScene(scene),out=path.resolve(opts.out);
  fs.mkdirSync(out,{recursive:true});
  const binPath=path.join(out,'xpz3d-terrain-v1.meshbin'),metaPath=path.join(out,'terrain-manifest.json');
  if(fs.existsSync(metaPath)){
    const older=JSON.parse(fs.readFileSync(metaPath,'utf8'));
    need(older.source.saveSha256===battle.sourceHash,'Refuse different battle in previous output');
  }
  const tmp=path.join(out,'.scene-'+process.pid+'.tmp');
  fs.writeFileSync(tmp,binary);fs.renameSync(tmp,binPath);
  scene.manifest.binary={filename:path.basename(binPath),sha256:sha(binary),bytes:binary.length,format:'XPZ3D26A'};
  fs.writeFileSync(metaPath,JSON.stringify(scene.manifest,null,2)+'\n');
  return {binPath,metaPath,manifest:scene.manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),o={};
    for(let i=0;i<args.length;i++){need(args[i].startsWith('--')&&i+1<args.length,'Bad flag');o[args[i++].slice(2)]=args[i];}
    const result=convert(o);
    console.log(JSON.stringify({kind:'REAL_OXCE_TERRAIN_CONVERTED',binary:result.binPath,
      manifest:result.metaPath,source:result.manifest.source,counts:result.manifest.counts,
      conversion:result.manifest.conversion},null,2));
  }catch(err){console.error('[XPZ3D terrain] '+err.message);process.exitCode=1;}
}
