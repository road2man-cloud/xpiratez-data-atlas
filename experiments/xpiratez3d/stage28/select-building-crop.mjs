// Read-only: find high-value REAL building/wall crops, never synthetic terrain.
import fs from 'node:fs';
import {readBattle} from '../stage26/convert-terrain.mjs';
const opts=process.argv.slice(2);
if(opts.length<1)throw Error('Usage: node select-building-crop.mjs <battle.sav> [span=12]');
const span=opts[1]?Number(opts[1]):12;
const battle=readBattle(opts[0]);
const [W,H]=battle.dims;
if(!Number.isInteger(span)||span<4||span>Math.min(W,H))throw Error('Invalid crop size');
const entries=[];
for(let y=0;y<=H-span;y++)for(let x=0;x<=W-span;x++){
 let walls=0,objs=0,floors=0,upper=0,doorCandidates=0;
 for(const t of battle.tiles){
  if(t.x<x||t.y<y||t.x>=x+span||t.y>=y+span)continue;
  if(t.ids[0]>=0)floors++;
  if(t.ids[3]>=0)objs++;
  for(const p of [1,2])if(t.ids[p]>=0){walls++;if(t.z>0)upper++;}
  if(t.flags&24)doorCandidates++;
 }
 const score=walls*10+upper*5+objs*0.1;
 entries.push({region:[x,y,span,span],score:Math.round(score*100)/100,
 walls,upperWalls:upper,objects:objs,floors,doorFlags:doorCandidates});
}
entries.sort((a,b)=>b.score-a.score||a.region[1]-b.region[1]||a.region[0]-b.region[0]);
console.log(JSON.stringify({battleId:battle.battleId,mission:battle.mission,mapSize:battle.dims,span,
 best:entries.slice(0,8),sourceOnly:true},null,2));
