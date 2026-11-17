'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const dir=__dirname;
const original=fs.readFileSync(path.join(dir,'debug_rev96_r24_flips.cjs'),'utf8');
const target="const conf=variant==='gentle'?{move:.0145,rim1:.0045,rim2:.0095,depth:.86,skinBulge:.0065}\n                                :{move:.020,rim1:.0065,rim2:.0140,depth:1.12,skinBulge:.0095};";
if(!original.includes(target))throw Error('No original conf');
const cases=[];
for(const ring1 of [0,.001,.002,.003,.004]){
 for(const ring2 of [.003,.005,.007,.009,.011]){
  cases.push({move:.018,rim1:ring1,rim2:ring2,depth:.65,skinBulge:.0020})
 }
}
for(let z=0;z<cases.length;z++){
 let c=cases[z],code=original.replace(target,'const conf='+JSON.stringify(c)+';');
 fs.writeFileSync(path.join(dir,'_r24_sweep_run.cjs'),code);
 const r=cp.spawnSync(process.execPath,['./_r24_sweep_run.cjs'],{cwd:dir,encoding:'utf8',timeout:3000});
 try{let d=JSON.parse(r.stdout);console.log(JSON.stringify({idx:z,...c,core:d.coreQ?.flips,skirt:d.skirtQ?.flips,zero:[d.coreQ?.zero,d.skirtQ?.zero]}));}catch{console.log('ERROR',z,r.stderr?.slice(0,220));}
}
fs.rmSync(path.join(dir,'_r24_sweep_run.cjs'));
