'use strict';
const fs=require('fs'),path=require('path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const url='http://127.0.0.1:9400/r36kp-pelvis-skinlab-20261128/preview/index.html';
async function main(){
 const res=await fetch('http://127.0.0.1:9341/json/new?'+encodeURIComponent(url),{method:'PUT'});
 if(!res.ok)throw Error('Chrome CDP tab '+res.status);
 const tab=await res.json(),ws=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map(),exceptions=[];let id=0;
 await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true});});
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);
  if(r.method==='Runtime.exceptionThrown')exceptions.push(r.params?.exceptionDetails?.exception?.description||r.params?.exceptionDetails?.text);
  if(r.id&&pending.has(r.id)){const {ok,bad}=pending.get(r.id);pending.delete(r.id);r.error?bad(Error(JSON.stringify(r.error))):ok(r.result);}
 });
 const cmd=(method,params={})=>new Promise((ok,bad)=>{const i=++id;pending.set(i,{ok,bad});ws.send(JSON.stringify({id:i,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await cmd('Runtime.enable');await cmd('Page.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 let ready=false,status=null;
 for(let k=0;k<180;k++){await delay(160);status=await ev("window.R36KP_SKINLAB?.status||{}");ready=await ev("!!window.R36KP_SKINLAB?.ready");if(ready)break;}
 if(!ready)throw Error('skinlab dashboard failed loading '+JSON.stringify({status,exceptions}));
 const assets=await ev("(()=>{const a=window.R36KP_SKINLAB.assets;return Object.fromEntries(Object.entries(a).map(([k,r])=>{let list=[];r?.traverse(o=>{if(o.isSkinnedMesh)list.push({mesh:o.name,verts:o.geometry.attributes.position.count,skinningMethod:typeof o.applyBoneTransform,oldSkinningMethod:typeof o.boneTransform})});return[k,list]}))})()");
 const report={url,assets,loaded:status,exceptions,captures:[]};
 async function shot(name,angle,mode='low',right='legacy',split=true){
  await ev("(()=>{document.querySelector('#spread').value="+angle+";document.querySelector('#spread').dispatchEvent(new Event('input'));document.querySelector('#modelMode').value="+JSON.stringify(mode)+";document.querySelector('#compare').value="+JSON.stringify(right)+";document.querySelector('#split').checked="+split+";window.R36KP_SKINLAB.updateMode();window.R36KP_SKINLAB.focus('pelvis');return true})()");
  await delay(900);
  const output=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const file=path.join(__dirname,'captures',name);fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=Buffer.from(output.data,'base64');fs.writeFileSync(file,bytes);
  const stat=await ev("(()=>({angle:document.querySelector('#spreadText').textContent,draw:document.querySelector('#gpu').textContent,spacing:document.querySelector('#spreadDistance').textContent,error:window.R36KP_SKINLAB.renderer.getContext().getError()}))()");
  report.captures.push({name,size:bytes.length,angle,mode,right,split,...stat});console.log('CAPTURE',name,JSON.stringify(stat));
 }
 await shot('R36KP_SKINLAB_00_BALANCED_VS_BASE.png',0);
 await shot('R36KP_SKINLAB_35_BALANCED_VS_BASE.png',35);
 await shot('R36KP_SKINLAB_35_SOFT_VS_BASE.png',35,'soft');
 await shot('R36KP_SKINLAB_35_BALANCED_VS_SOFT.png',35,'low','soft');
 report.triangles=await ev("window.R36KP_SKINLAB.triangles");
 report.pass=report.captures.every(x=>x.error===0)&&exceptions.length===0;
 fs.writeFileSync(path.join(__dirname,'BROWSER_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pass:report.pass,triangles:report.triangles,assets},null,2));ws.close();
 if(!report.pass)process.exit(1);
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
