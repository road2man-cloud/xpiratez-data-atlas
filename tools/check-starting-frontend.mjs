import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("public/starting/app.js","utf8");
const data=JSON.parse(fs.readFileSync("public/data/starting-bonuses.json","utf8"));
const countCards=html=>(html.match(/<article class="card"/g)||[]).length;
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
assert.equal(data.meta.rawEventCount,39);

function mount({failData=false,waitNames=true}={}){
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{
      value:selector==="#kind"?"all":selector==="#sort"?"source":"",
      innerHTML:"",textContent:"",listeners:{},
      addEventListener(type,fn){this.listeners[type]=fn;}
    });
    return elements.get(selector);
  };
  let shouldFail=failData,namesLoads=0,resolveNames;
  const namesPromise=new Promise(resolve=>{resolveNames=resolve});
  const ctx=vm.createContext({
    console:{error(){},warn(){}},Intl,Map,Set,
    document:{querySelector:element},
    fetch:async url=>{
      if(url.includes("starting-bonuses.json")){
        if(shouldFail)return{ok:false,status:503};
        return{ok:true,json:async()=>data};
      }
      namesLoads++;
      if(waitNames)return namesPromise;
      return{ok:false,status:503};
    }
  });
  vm.runInContext(source,ctx);
  return{element,ctx,namesLoads:()=>namesLoads,completeNames:names=>resolveNames({ok:true,json:async()=>({names})}),recover:()=>{shouldFail=false}};
}
{
  const ui=mount({waitNames:true});
  await flush();
  // The optional 1-MB entity dictionary is still pending. Cards must
  // already be visible and searchable before it finishes.
  assert.equal(countCards(ui.element("#cards").innerHTML),37,"Cards blocked by slow translations");
  assert.equal(ui.namesLoads(),1);
  assert.match(ui.element("#stats").innerHTML,/39/);
  assert.match(ui.element("#cards").innerHTML,/STR_CLOTHING_TRIBAL/);
  ui.element("#search").value="nomatch_000000000";
  ui.element("#search").listeners.input();
  assert.equal(countCards(ui.element("#cards").innerHTML),0);
  ui.element("#search").value="STR_EGYPT";
  ui.element("#search").listeners.input();
  assert(countCards(ui.element("#cards").innerHTML)>=1);
  assert.match(ui.element("#cards").innerHTML,/STR_THEBAN_ASSAULT_CLONE/);
  ui.element("#search").value="";
  ui.element("#kind").value="country";
  ui.element("#kind").listeners.change();
  assert.equal(countCards(ui.element("#cards").innerHTML),24);
  ui.element("#kind").value="region";
  ui.element("#kind").listeners.change();
  assert.equal(countCards(ui.element("#cards").innerHTML),13);
  ui.element("#kind").value="all";
  ui.element("#kind").listeners.change();
  const before=ui.element("#cards").innerHTML;
  ui.element("#sort").value="points";
  ui.element("#sort").listeners.change();
  assert.notEqual(ui.element("#cards").innerHTML,before,"Sort did not reorder cards");
  ui.completeNames({STR_CLOTHING_TRIBAL:["민속 의상","Tribal Clothes"]});
  await flush();
  assert.match(ui.element("#cards").innerHTML,/민속 의상/,"Late translations did not refresh cards");
}
{
  const ui=mount({failData:true,waitNames:false});
  await flush();
  assert.match(ui.element("#cards").innerHTML,/HTTP 503/);
  assert.match(ui.element("#cards").innerHTML,/retryStarting/);
  assert.equal(typeof ui.element("#retryStarting").listeners.click,"function");
  ui.recover();
  ui.element("#retryStarting").listeners.click();
  await flush();
  assert.equal(countCards(ui.element("#cards").innerHTML),37,"Retry did not recover");
}
{
  const ui=mount({waitNames:false});
  await flush();
  assert.equal(countCards(ui.element("#cards").innerHTML),37,"Optional translation failure blocks core DB");
}
const html=fs.readFileSync("public/starting/index.html","utf8");
assert.match(html,/스타팅 보너스 데이터 불러오는 중/);
assert.match(html,/id="cards"/);
console.log("OK starting frontend: 37 cards, 13 regions, 24 countries, search/sort, delayed/missing translation, HTTP retry");
