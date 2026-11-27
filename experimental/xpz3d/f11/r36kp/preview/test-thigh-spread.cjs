'use strict';
// Browser regression: actual knee world positions, not source-string assertions.
const fs=require('fs'),path=require('path');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const cases=[
 ['r36kp','r36kp/preview/index.html','R36KO2100'],
 ['r36kq','r36kp-texture-lab-20261127/r36kq/preview/index.html','R36KQ'],
 ['r36kr','r36kp-texture-lab-20261127/r36kr/preview/index.html','R36KR'],
 ['r36ks','r36kp-texture-lab-20261127/r36ks/preview/index.html','R36KS'],
 ['r36kt','r36kp-texture-lab-20261127/r36kt/preview/index.html','R36KT']
];
async function main(){
 const base='http://127.0.0.1:9400/',cdp='http://127.0.0.1:9341';
 const report={date:new Date().toISOString(),source:'Actual browser GLB world-space transforms',results:[]};
 for(const [id,url,globalName]of cases){
  const response=await fetch(cdp+'/json/new?'+encodeURIComponent(base+url),{method:'PUT'});
  if(!response.ok)throw Error('Cannot create Chrome tab: '+response.status);
  const tab=await response.json(),socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});});
  let nextId=0;const pending=new Map(),exceptions=[];
  socket.addEventListener('message',evt=>{
   const data=JSON.parse(evt.data);
   if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);
   if(data.id&&pending.has(data.id)){
    const callbacks=pending.get(data.id);pending.delete(data.id);
    data.error?callbacks.bad(Error(JSON.stringify(data.error))):callbacks.ok(data.result);
   }
  });
  const send=(method,params={})=>new Promise((ok,bad)=>{
   const n=++nextId;pending.set(n,{ok,bad});socket.send(JSON.stringify({id:n,method,params}));
  });
  const evalJS=async expr=>{
   const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
  };
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  const key=JSON.stringify(globalName);
  let ready=false;
  for(let i=0;i<160;i++){
   await delay(170);
   ready=await evalJS('!!window['+key+']?.assets?.low');
   if(ready)break;
  }
  if(!ready)throw Error('Model not ready: '+id);
  const one={name:id,url,poses:[],exceptions};
  for(const degrees of [0,18,35,0,35]){
   const js='(()=>{const env=window['+key+'],root=env.assets.low;'
     +'const slider=document.querySelector("#spread");slider.value='+degrees+';'
     +'slider.dispatchEvent(new Event("input",{bubbles:true}));'
     +'if('+degrees+'===0)env.focus("pelvis");'
     +'const L=root.getObjectByName("L_Thigh"),R=root.getObjectByName("R_Thigh"),'
     +'K1=root.getObjectByName("L_Leg"),K2=root.getObjectByName("R_Leg");'
     +'if(!L||!R||!K1||!K2)return {error:"missing bone"};'
     +'root.updateMatrixWorld(true);'
     +'const lhs=L.matrixWorld.elements[12],rhs=R.matrixWorld.elements[12],'
     +'l=K1.matrixWorld.elements[12],r=K2.matrixWorld.elements[12];'
     +'return {angle:'+degrees+',leftKnee:l,rightKnee:r,hips:lhs-rhs,knees:l-r,'
     +'ui:document.querySelector("#spreadDistance")?.textContent,'
     +'gpu:document.querySelector("#gpu")?.textContent};})()';
   const measurement=await evalJS(js);
   if(measurement.error)throw Error(id+' '+measurement.error);
   one.poses.push(measurement);
   if(id==='r36kp'&&(degrees===0&&one.poses.length===1||degrees===35&&one.poses.length===3)){
    await delay(900);
    const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const target=path.join(__dirname,'captures','R36KP_SPREAD_'+degrees+'.png');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,Buffer.from(png.data,'base64'));one['capture'+degrees]=path.relative(__dirname,target);
   }
  }
  const [zero,mid,full,again0,again35]=one.poses;
  one.increase=zero.knees<mid.knees&&mid.knees<full.knees;
  one.bothOutward=full.leftKnee>zero.leftKnee&&full.rightKnee<zero.rightKnee;
  one.repeatable=Math.abs(again0.knees-zero.knees)<1e-6&&Math.abs(again35.knees-full.knees)<1e-6;
  one.passed=one.increase&&one.bothOutward&&one.repeatable&&exceptions.length===0;
  console.log(JSON.stringify({id,passed:one.passed,neutral:zero.knees,degree18:mid.knees,degree35:full.knees,
    leftShift:full.leftKnee-zero.leftKnee,rightShift:full.rightKnee-zero.rightKnee}));
  report.results.push(one);socket.close();
  if(!one.passed)throw Error('POSE REGRESSION '+id);
 }
 fs.writeFileSync(path.join(__dirname,'POSE_REGRESSION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PASS: All five dashboards spread in the outward direction');
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
