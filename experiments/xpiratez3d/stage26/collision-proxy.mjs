#!/usr/bin/env node
// Stage26 distinct *approximate* movement hulls from real X-Piratez tiles.
// Visual polygons stay exact LOFT-surface meshes; AI hulls are deliberately
// simplified and tagged so this cannot pass exact collision/LOS/damage gates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
import {readBattle,loftMesh,encodeNativeScene} from './convert-terrain.mjs';
function check(v,msg){if(!v)throw Error(msg);}
function args(argv){
 const a={};
 for(let i=0;i<argv.length;i++){
  check(argv[i].startsWith('--')&&i+1<argv.length,'Missing argument '+argv[i]);
  a[argv[i++].slice(2)]=argv[i];
 }
 return a;
}
function resolve(game,rel){
 for(const root of [path.join(game,'user','mods','Piratez'),path.join(game,'UFO')]){
  let p=root;
  if(!fs.existsSync(p))continue;
  for(const k of rel.split('/')){
   const hit=fs.readdirSync(p).find(x=>x.toUpperCase()===k.toUpperCase());
   if(!hit){p=null;break;}p=path.join(p,hit);
  }
  if(p&&fs.existsSync(p)&&fs.statSync(p).isFile())return p;
 }
 throw Error('Missing local asset '+rel);
}
function mcd(game,name){
 const raw=fs.readFileSync(resolve(game,'TERRAIN/'+name+'.MCD'));
 check(raw.length%62===0,'Corrupt MCD '+name);
 return [...Array(raw.length/62)].map((_,i)=>{
  const p=i*62;
  return {loft:[...raw.subarray(p+8,p+20)],noFloor:raw[p+32],
   walkTU:raw[p+39],stopLOS:raw[p+31],tileType:raw[p+53]};
 });
}
function bboxFromShape(shape,filterSlices=12){
 let x0=16,y0=16,z0=12,x1=0,y1=0,z1=0,count=0;
 // voxel region used for low-poly movement obstacle; faces from real shape
 // determine bounds, not invented rectangular building placements.
 for(const p of shape.verts){
  if(p[2]>filterSlices)continue;
  x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);z0=Math.min(z0,p[2]);
  x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);z1=Math.max(z1,p[2]);count++;
 }
 return count?{x0,x1,y0,y1,z0,z1}:null;
}
function box(tris,verts,base,size){
 const [x,y,z]=base,[dx,dy,dz]=size;
 if(dx<=0||dy<=0||dz<=0)return;
 const n=verts.length;
 verts.push([x,y,z],[x+dx,y,z],[x+dx,y+dy,z],[x,y+dy,z],
            [x,y,z+dz],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]);
 const src=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],
  [0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
 for(const a of src)tris.push(a.map(i=>n+i));
}
export function makeProxy(b,game,opts={}){
 const region=opts.region||[0,0,60,60],chunk=opts.chunk||6;
 const scale=opts.scale||120;
 const [rx,ry,rw,rh]=region;
 check(b.dims[0]===60&&b.dims[1]===60,'Only 60x60 source battle');
 check([rx,ry,rw,rh].every(Number.isInteger)&&rx>=0&&ry>=0&&rw>0&&rh>0&&rx+rw<=60&&ry+rh<=60,'Bad region');
 check(scale===120||scale===160,'Only 120 or 160 scale');
 const xy=scale*.625/60,fo=2.5;
 const loft=fs.readFileSync(resolve(game,'GEODATA/LOFTEMPS.DAT'));
 const cache=new Map(),shapes=new Map();
 const rows=new Map(),objs=[];
 let floorRefs=0,wallRefs=0,objectRefs=0,passableSkipped=0,objectsSkippedEmpty=0;
 for(const tile of b.tiles){
  if(tile.x<rx||tile.x>=rx+rw||tile.y<ry||tile.y>=ry+rh)continue;
  for(let part=0;part<4;part++){
   const id=tile.ids[part],set=tile.sets[part];
   if(id===-1&&set===-1)continue;
   check(id>=0&&set>=0&&set<b.terrainSets.length,'Invalid source ref');
   const name=b.terrainSets[set];
   if(!cache.has(name))cache.set(name,mcd(game,name));
   const rec=cache.get(name)[id];
   check(rec,'Missing MCD '+name+'/'+id);
   const k=name+':'+id;
   if(!shapes.has(k))shapes.set(k,loftMesh(rec,loft));
   const shape=shapes.get(k);
   if(!shape.voxels){objectsSkippedEmpty++;continue;}
   if(part===0){
    if(rec.noFloor)continue;
    floorRefs++;
    const key=tile.z+':'+tile.y;
    if(!rows.has(key))rows.set(key,[]);
    rows.get(key).push(tile.x);
   }else if(part===1||part===2){
    // Preserve wall's x/y tile edge and approximation of occupied vertical
    // interval; aperture/window shape needs dedicated full collision later.
    const opened=(part===1&&(tile.flags&8))||(part===2&&(tile.flags&16));
    if(opened)continue;
    wallRefs++;
    const bounds=bboxFromShape(shape);
    if(!bounds)continue;
    const z0=tile.z*fo+(bounds.z0/12)*fo;
    const z1=tile.z*fo+(bounds.z1/12)*fo;
    const edge=.10; // navigation seam: narrower than one S2 cell
    objs.push({x:(tile.x+(part===1?0:0))*xy,y:(tile.y+(part===1?0:0))*xy,z:z0,
      dx:(part===1?edge:xy),dy:(part===1?xy:edge),dz:Math.max(z1-z0,.1),
      floor:tile.z,part});
   }else{
    objectRefs++;
    // Original TU=255 means impassable to OXCE units. Other objects are
    // traversable; don't insert collision blockers that invent an obstacle.
    if(rec.walkTU!==255){passableSkipped++;continue;}
    const lower=bboxFromShape(shape,6)||bboxFromShape(shape,12);
    if(!lower)continue;
    const inset=.03;
    const minX=(tile.x+lower.x0/16)*xy+inset,minY=(tile.y+lower.y0/16)*xy+inset;
    const maxX=(tile.x+lower.x1/16)*xy-inset,maxY=(tile.y+lower.y1/16)*xy-inset;
    if(maxX<=minX||maxY<=minY)continue;
    // The footprint is grounded in the real LOFT lower occupied mask, but
    // the vertical hull is a LOW-LOD approximation, not exact foliage/limbs.
    objs.push({x:minX,y:minY,z:tile.z*fo+(lower.z0/12)*fo,
      dx:maxX-minX,dy:maxY-minY,
      dz:Math.max(.13,Math.min(2.3,(lower.z1-lower.z0)/12*fo)),
      floor:tile.z,part});
   }
  }
 }
 const primitives=[];
 for(const [key,xs] of rows){
  const [z,y]=key.split(':').map(Number),unique=[...new Set(xs)].sort((a,b)=>a-b);
  let start=null,end=null;
  const push=()=>{
   if(start===null)return;
   primitives.push({x:start*xy,y:y*xy,z:z*fo-.10,dx:(end-start+1)*xy,dy:xy,dz:.10,
    floor:z,part:0});
  };
  for(const x of unique){
   if(start===null){start=end=x;continue;}
   if(x===end+1){end=x;continue;}
   push();start=end=x;
  }
  push();
 }
 primitives.push(...objs);
 const groups=new Map();
 for(const p of primitives){
  const cx=Math.floor(p.x/(chunk*xy)),cy=Math.floor(p.y/(chunk*xy));
  const mat=p.part===0?0:p.part===3?7:1;
  const key=[cx,cy,p.floor,mat].join(':');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(p);
 }
 const meshes=[];
 let vertexCount=0,triangleCount=0;
 for(const [key,boxes] of groups){
  const [cx,cy,floor,material]=key.split(':').map(Number);
  let verts=[],tris=[],count=0;
  const flush=()=>{
   if(!verts.length)return;
   meshes.push({cx,cy,floor,material,verts:verts.flat(),tris:tris.flat(),count});
   vertexCount+=verts.length;triangleCount+=tris.length;
   verts=[];tris=[];count=0;
  };
  for(const p of boxes){
   if(verts.length+8>=60000)flush();
   box(tris,verts,[p.x,p.y,p.z],[p.dx,p.dy,p.dz]);
   count++;
  }
  flush();
 }
 const manifest={
   schema:'xpz3d.oxce-terrain-collision-proxy.v1',
   source:{saveSha256:b.sourceHash,battleId:b.battleId,mapSize:b.dims},
   conversion:{
     region,partial:!(rx===0&&ry===0&&rw===60&&rh===60),
     s2Grid:[scale,scale],sourceTileMeters:xy,floorHeightMeters:fo,
     derivedFromOriginalLOFT:true,accurateGeometry:false,
     sourceWalkTU255GroundObjectBlocks:true,
     clearOpenDoors:true,windowAperturePreserved:false,
     accurateWeaponCollision:false,accurateLineOfSight:false,
     accurateStairsAndPathNetwork:false,
     standardGroundUsesRowMergedRealFloorTiles:true,
     worldHeightOriginTested:false,
   },
   counts:{originalFloorRefs:floorRefs,originalWallRefs:wallRefs,
     originalObjectRefs:objectRefs,walkableObjectsNotBlocked:passableSkipped,
     emptyOrMissingSolid:objectsSkippedEmpty,
     primitiveCount:primitives.length,sourceShapeTemplates:shapes.size,
     coarseCollisionMeshes:meshes.length,vertices:vertexCount,triangles:triangleCount},
   evidence:'Derived from actual OXCE serialized tile/MCD LOFT geometry for fast nav proof, NOT final collision',
   originalSavePreserved:true
 };
 return {meshes,manifest};
}
export function convert(opts){
 check(opts.save&&opts['game-root']&&opts.out,'Required --save --game-root --out');
 const b=readBattle(opts.save,opts.battle);
 const options={region:opts.region?opts.region.split(',').map(Number):undefined,
   chunk:opts.chunk==null?6:Number(opts.chunk),
   scale:opts.scale==null?120:Number(opts.scale)};
 const s=makeProxy(b,opts['game-root'],options);
 // Re-use strict S2 scene binary format with own real-source collision mesh
 // source map dimensions and tile scale.
 const data=encodeNativeScene(s),output=path.resolve(opts.out);
 fs.mkdirSync(output,{recursive:true});
 const bin=path.join(output,'xpz3d-collision-proxy-v1.meshbin');
 const manifest=path.join(output,'collision-proxy-manifest.json');
 if(fs.existsSync(manifest)){
  const old=JSON.parse(fs.readFileSync(manifest,'utf8'));
  check(old.source.saveSha256===b.sourceHash,'Refusing to overwrite another battle');
 }
 fs.writeFileSync(bin,data);
 s.manifest.binary={filename:path.basename(bin),sha256:sha(data),bytes:data.length,format:'XPZ3D26A'};
 fs.writeFileSync(manifest,JSON.stringify(s.manifest,null,2)+'\n');
 return {manifest,bin,counts:s.manifest.counts};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/collision-proxy.mjs')){
 try{console.log(JSON.stringify(convert(args(process.argv.slice(2))),null,2))}
 catch(e){console.error('XPZ3D COLLISION_PROXY_ERROR: '+e.stack);process.exitCode=1;}
}
