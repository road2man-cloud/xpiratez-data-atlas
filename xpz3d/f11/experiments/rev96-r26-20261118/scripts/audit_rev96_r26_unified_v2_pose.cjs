'use strict';const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const page=await browser.newPage({viewport:{width:1450,height:1000}});
await page.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r26-smoothed.html',{waitUntil:'domcontentloaded',timeout:18000});
await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:20000});
const data=[];
for(const angle of [0,25,40,55]){
 const result=await page.evaluate(angle=>{
  state.spread=angle;state.wire=false;state.surfaceFilter='all';state.layerChoice='all';
  for(const v of viewers){v.lastSpread=null;v.draw();}
  const v=viewers[1],groups=new Map(),roi=new Set([0,13,17,18,21,22,23]);
  for(const part of v.parts){if(!roi.has(part.primitiveIndex))continue;
   const used=new Set(part.sourceIndices);
   for(const id of used){
    const o=id*3,p=part.sourcePositions,m=part.sourceMorph,q=part.posedPositions;
    const key=[p[o],p[o+1],p[o+2],m[o],m[o+1],m[o+2]].map(x=>Math.round(x*1e5)).join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({pi:part.primitiveIndex,id,raw:[p[o],p[o+1],p[o+2]],pose:[q[o],q[o+1],q[o+2]]});
   }
  }
  let merged=0,max=0,totalDist=0,violations=[],distances=[];
  for(const refs of groups.values()){if(new Set(refs.map(x=>x.pi)).size<2)continue;merged++;
   for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++)if(refs[i].pi!==refs[j].pi){
    const d=Math.hypot(...refs[i].pose.map((x,k)=>x-refs[j].pose[k]));distances.push(d);totalDist+=d;max=Math.max(max,d);
    if(d>.0003)violations.push({distance:d,a:refs[i],b:refs[j]});
   }
  }
  violations.sort((a,b)=>b.distance-a.distance);
  return {angle,groupCount:merged,pairs:distances.length,maxDistance:max,mean:totalDist/(distances.length||1),countOver0p3mm:violations.length,top:violations.slice(0,12)};
 },angle);
 data.push(result);
}
await browser.close();const name='REV96_USER101_R26_UNIFIED_V2_POSED_SEAMS.json';fs.writeFileSync(path.join(__dirname,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(data.map(({angle,groupCount,pairs,maxDistance,mean,countOver0p3mm,top})=>({angle,groupCount,pairs,maxDistance,mean,countOver0p3mm,top:top.slice(0,3)})),null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=2});