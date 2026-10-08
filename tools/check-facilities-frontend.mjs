import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

// Execute the shipped frontend with its actual JSON and lightweight DOM controls.
const elements=new Map();
function element(selector){
  if(!elements.has(selector))elements.set(selector,{
    value:"",checked:false,innerHTML:"",textContent:"",listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn},appendChild(){},
    showModal(){this.open=true},close(){this.open=false}
  });
  return elements.get(selector);
}
let headers=[];
const context=vm.createContext({
  console,Map,document:{
    querySelector:element,createElement:()=>({}),
    querySelectorAll(selector){
      if(selector==='th[data-sort]'){
        headers=[...element('#facilityTable thead').innerHTML.matchAll(/<th data-sort="([^"]+)"/g)]
          .map(([,key])=>Object.assign(element('header:'+key),{dataset:{sort:key}}));
        return headers;
      }
      return [];
    }
  },
  async fetch(url){return {ok:true,json:async()=>JSON.parse(fs.readFileSync('public/'+url.replace('../','').split('?')[0],'utf8'))}}
});
vm.runInContext(fs.readFileSync('public/facilities/app.js','utf8'),context);
// load() is asynchronous; flush its file-backed fetch/json promises.
await new Promise(resolve=>setImmediate(resolve));
const run=code=>vm.runInContext(code,context);
const data=JSON.parse(fs.readFileSync('public/data/facilities-index.json','utf8')).index;
assert.equal(run('filtered().length'),115);
const toggle=checked=>{element('#efficiencyView').checked=checked;element('#efficiencyView').listeners.change()};
const click=key=>{const h=headers.find(x=>x.dataset.sort===key);assert(h,'Missing sortable column '+key);h.listeners.click()};
const checkOrder=(key,dir)=>{
  const values=Array.from(run('filtered()'),x=>x[key]);
  assert(values.every((v,i)=>!i||(v-values[i-1])*dir>=0),key+' sort direction '+dir);
};
for(const [raw,eff,col] of [['storage','storagePerTile',7],['labs','labsPerTile',8],['workshops','workshopsPerTile',9],['trainingRooms','trainingPerTile',10]]){
  toggle(false);click(raw);toggle(true);
  assert.equal(run('sort.key'),eff);assert.equal(run('sort.dir'),-1);
  checkOrder(eff,-1);click(eff);checkOrder(eff,1);
  const rows=[...element('#facilityTable tbody').innerHTML.matchAll(/<tr data-id="([^"]+)">(.*?)<\/tr>/g)];
  for(const [,id,html] of rows){
    const cell=[...html.matchAll(/<td(?: [^>]*)?>(.*?)<\/td>/g)][col][1];
    assert.equal(cell,data.find(x=>x.id===id)[eff].toLocaleString('ko-KR',{maximumFractionDigits:1}));
  }
  assert.equal((element('#facilityTable thead').innerHTML.match(/<th[ >]/g)||[]).length,17);
  toggle(false);assert.equal(run('sort.key'),raw);assert.equal(run('sort.dir'),1);
}
toggle(true);
for(const [name,key,value] of [['궁극의 금고','storagePerTile','333.3'],['생명공학 연구실','labsPerTile','10'],['공장','workshopsPerTile','44.4'],['VIP 클럽','trainingPerTile','16']]){
  element('#search').value=name;element('#search').listeners.input();
  const row=Array.from(run('filtered()')).find(x=>x.koName===name);assert(row);
  assert.equal(run('fmt('+row[key]+')'),value);
  await run('openDetail('+JSON.stringify(row.id)+')');
  assert(element('#detailDialog').open);
  assert(element('#detailBody').innerHTML.includes(value+'/칸'));
  element('#closeDialog').listeners.click();assert.equal(element('#detailDialog').open,false);
}
element('#search').value='';element('#role').value='research';element('#role').listeners.change();
const count=data.filter(x=>x.roles.includes('research')).length;
assert.equal(run('filtered().length'),count);click('labsPerTile');toggle(false);
assert.equal(run('filtered().length'),count);assert.equal(element('#role').value,'research');
// Nulls stay last in either direction, while zero remains a real value.
run('DATA.index=[{koName:"A",storagePerTile:null},{koName:"B",storagePerTile:0},{koName:"C",storagePerTile:0.04},{koName:"D",storagePerTile:0.03}];sort={key:"storagePerTile",dir:-1}');
element('#role').value='';
assert.deepEqual(Array.from(run('filtered()'),x=>x.koName),['C','D','B','A']);
run('sort.dir=1');assert.deepEqual(Array.from(run('filtered()'),x=>x.koName),['B','D','C','A']);
const html=fs.readFileSync('public/facilities/index.html','utf8');
assert.match(html,/<input id="efficiencyView" type="checkbox" aria-describedby="efficiencyHelp">/);
console.log('OK facilities frontend: 115 rows, four precision sorts both directions, 17 columns, sort mapping, examples/details, filter retention, zero/null handling');
