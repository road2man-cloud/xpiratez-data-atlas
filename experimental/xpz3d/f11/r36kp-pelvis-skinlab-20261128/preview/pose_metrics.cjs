'use strict';
const fs=require('fs'),path=require('path');const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function main(){
 const url='http://127.0.0.1:9400/r36kp-pelvis-skinlab-20261128/preview/index.html';
 const tab=await (await fetch('http://127.0.0.1:9341/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 const ws=new WebSocket(tab.webSocketDebuggerUrl),queue=new Map();let id=0;
 await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true})});
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id&&queue.has(data.id)){const item=queue.get(data.id);queue.delete(data.id);data.error?item.bad(Error(JSON.stringify(data.error))):item.ok(data.result)}});
 const send=(method,params={})=>new Promise((ok,bad)=>{const n=++id;queue.set(n,{ok,bad});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
 await send('Runtime.enable');
 let ready=false;for(let k=0;k<120;k++){await sleep(180);ready=await evaluate('!!window.R36KP_SKINLAB?.ready');if(ready)break;}
 if(!ready)throw Error('models never loaded');
 const result={source:'real Three.js skinned mesh applyBoneTransform, actual browser',poses:[]};
 for(const angle of [0,18,35]){
  await evaluate("(()=>{const s=document.getElementById('spread');s.value="+angle+";s.dispatchEvent(new Event('input'));return true})()");
  await sleep(110);
  const code="(()=>{const a=window.R36KP_SKINLAB.assets,T=window.R36KP_SKINLAB.THREE;let r={};for(const key of ['legacy','soft','low']){const root=a[key];let mesh;root.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes('GAME_SKIN'))mesh=o});if(!mesh)throw Error('body missing '+key);mesh.updateMatrixWorld(true);mesh.skeleton.update();const pos=mesh.geometry.attributes.position;let n=0,absX=0,minX=Infinity,maxX=-Infinity,centerX=0;for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(Math.abs(x)>.075||z<.82||z>.98||y>0)continue;const v=new T.Vector3(x,y,z);mesh.applyBoneTransform(i,v);mesh.localToWorld(v);n++;absX+=Math.abs(v.x);centerX+=v.x;minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x)}r[key]={count:n,meanAbsX:absX/n,meanX:centerX/n,minX,maxX}}return r})()";
  const values=await evaluate(code);result.poses.push({angle,values});console.log('POSE',angle,JSON.stringify(values));
 }
 const orig=result.poses[2].values.legacy.meanAbsX,soft=result.poses[2].values.soft.meanAbsX,balanced=result.poses[2].values.low.meanAbsX;
 result.comparisonAt35={originalCenterMeanAbsX:orig,softCenterMeanAbsX:soft,balancedCenterMeanAbsX:balanced,
 softReduction:(orig-soft)/orig,balancedReduction:(orig-balanced)/orig};
 fs.writeFileSync(path.join(__dirname,'POSE_METRICS_REPORT.json'),JSON.stringify(result,null,2)+'\n');
 console.log('RESULT',JSON.stringify(result.comparisonAt35));ws.close();
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
