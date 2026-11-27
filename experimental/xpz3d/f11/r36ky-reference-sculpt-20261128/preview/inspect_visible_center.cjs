'use strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const url='http://127.0.0.1:9400/r36ky-reference-sculpt-20261128/preview/index.html';
 const resp=await fetch('http://127.0.0.1:9341/json/new?'+encodeURIComponent(url),{method:'PUT'});if(!resp.ok)throw Error('CDP tab status '+resp.status);
 const tab=await resp.json(),sock=new WebSocket(tab.webSocketDebuggerUrl),callbacks=new Map();let id=0;
 await new Promise((ok,fail)=>{sock.addEventListener('open',ok,{once:true});sock.addEventListener('error',fail,{once:true})});
 sock.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.id&&callbacks.has(d.id)){const a=callbacks.get(d.id);callbacks.delete(d.id);d.error?a.fail(Error(JSON.stringify(d.error))):a.ok(d.result);}});
 const c=(method,params={})=>new Promise((ok,fail)=>{const uid=++id;callbacks.set(uid,{ok,fail});sock.send(JSON.stringify({id:uid,method,params}));});
 const ev=async js=>{const r=await c('Runtime.evaluate',{expression:js,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 await c('Runtime.enable');await c('Page.enable');await c('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 for(let k=0;k<125;k++){await delay(180);if(await ev('!!window.R36KY?.ready'))break;}
 const s=await ev("(()=>{const w=window.R36KY,T=w.THREE;const root=w.assets.low;document.querySelector('#spread').value=0;document.querySelector('#spread').dispatchEvent(new Event('input'));const rect=document.querySelector('#view').getBoundingClientRect();const ray=new T.Raycaster();const samples=[];let misses=0;for(let y=440;y<=680;y+=20)for(let x=495;x<=720;x+=20){const px=(x-rect.left)/(rect.width/2)*2-1,py=-((y-rect.top)/rect.height*2-1);ray.setFromCamera(new T.Vector2(px,py),w.camera);const hit=ray.intersectObject(root,true).filter(o=>o.object.userData.r36cat==='body')[0];if(!hit){misses++;continue;}const g=hit.object.geometry,idx=g.index,face=hit.faceIndex,a=idx?idx.getX(face*3):face*3,b=idx?idx.getX(face*3+1):face*3+1,c=idx?idx.getX(face*3+2):face*3+2;const pos=g.getAttribute('position'),verts=[a,b,c].map(i=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);samples.push({px:x,py:y,face,x:hit.point.x,y:hit.point.y,z:hit.point.z,verts})}return {rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},camera:{pos:w.camera.position.toArray(),target:null},misses,samples}})()");
 console.log(JSON.stringify(s,null,2));sock.close();
}
run().catch(e=>{console.error(e.stack||e);process.exit(1)});
