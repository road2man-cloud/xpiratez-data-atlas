// Local-only, read-only X-Piratez 2.1 two-save research diary comparison.
// Usage: node tools/research-diary-delta.mjs <older.sav> <newer.sav>
// Do not commit any real save, filenames, campaign identifiers or output snapshots.
// A diary prefix proves an observed append-only log, NOT that the snapshots
// belong to the same campaign or that unobserved intermediate turns did not occur.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {importModernSave} from "../public/soldiers/modern/save-adapter.js";
import {facilityEvidence} from "../public/soldiers/modern/save-personnel.js";
import {inspectAutoZeroCascade} from "../public/soldiers/modern/auto-zero-cascade.js";
const arr=x=>Array.isArray(x)?x:[];
const day=x=>[Number(x.year),Number(x.month),Number(x.day)];
const dateKey=x=>day(x).map(x=>String(x).padStart(6,"0")).join("-");
function diaryKey(x){
  return JSON.stringify([x.id,x.year,x.month,x.day,x.sourceType,x.sourceName||""]);
}
function baseEvidence(base,data){
  if(!base||base.itemsComplete!==true||base.researchComplete!==true||
      base.facilitiesComplete!==true)return null;
  const facilities=facilityEvidence(base,
    Object.entries(data.baseFacilityFunctions||{}).map(([id,r])=>({
      id,provideBaseFunc:arr(r.provides)
    })));
  if(!facilities.complete)return null;
  return {
    items:Object.fromEntries(base.items),
    baseFunctions:new Set([...facilities.functions].filter(([,count])=>count>0).map(([id])=>id)),
    activeResearch:new Set(base.researchProjects)
  };
}
export function compareResearchDiarySnapshots(data,older,newer){
  const first=older?.research,second=newer?.research;
  const warnings=[],empty={kind:"unverified",warnings,diaryPrefix:false,
    appended:[],observedAutomatic:[],newCompleted:[],noLongerCompleted:[],
    newDisabled:[],reenabled:[],oldDiaryCount:0,newDiaryCount:0};
  if(!first||!second)return {...empty,warnings:["연구 상태가 없는 세이브"]};
  const before=arr(first.diary),after=arr(second.diary);
  const base={...empty,oldDiaryCount:before.length,newDiaryCount:after.length};
  if(first.unparsedDiaryCount||second.unparsedDiaryCount||
      first.unknownDiaryCount||second.unknownDiaryCount)
    warnings.push("연구 일지 일부가 판독되지 않아 연쇄 순서를 증명할 수 없음");
  if(newer.monthsPassed!=null&&older.monthsPassed!=null&&
      Number(newer.monthsPassed)<Number(older.monthsPassed))
    warnings.push("신규 세이브의 캠페인 월수가 과거로 역행함");
  if(before.length===0||after.length<before.length||
      before.some((e,i)=>diaryKey(e)!==diaryKey(after[i])))
    warnings.push("연구 일지의 동일 접두 구간이 확인되지 않음");
  if(warnings.length)return {...base,warnings};
  const appended=after.slice(before.length);
  if(appended.some((entry,index)=>{
    const predecessor=index?appended[index-1]:before.at(-1);
    return predecessor&&dateKey(entry)<dateKey(predecessor);
  }))return {...base,warnings:["추가 연구 일지의 날짜가 역행함"]};
  const prior=new Set(arr(first.completed)),current=new Set(arr(second.completed));
  const disabledBefore=new Set(arr(first.disabled)),disabledAfter=new Set(arr(second.disabled));
  const newCompleted=[...current].filter(id=>!prior.has(id));
  const noLongerCompleted=[...prior].filter(id=>!current.has(id));
  const newDisabled=[...disabledAfter].filter(id=>!disabledBefore.has(id));
  const reenabled=[...disabledBefore].filter(id=>!disabledAfter.has(id));
  const newIds=new Set(appended.map(e=>e.id));
  const unlogged=newCompleted.filter(id=>!newIds.has(id));
  if(unlogged.length)warnings.push("완료 연구 증가분 중 연구 일지에 없는 항목이 존재");
  const observedAutomatic=appended.filter(e=>e.sourceType===2).map(entry=>{
    const rule=data.researchRules?.[entry.id];
    const sourceRule=data.researchRules?.[entry.sourceName];
    const isNew=current.has(entry.id)&&!prior.has(entry.id);
    const chronology=prior.has(entry.sourceName)||
      appended.slice(0,appended.indexOf(entry)).some(e=>e.id===entry.sourceName);
    const supportedBases=[];
    if(rule&&sourceRule&&isNew&&chronology&&Number(rule.cost)===0)
      arr(older.personnel?.bases).forEach((b,index)=>{
        const proof=baseEvidence(b,data);
        if(!proof)return;
        const result=inspectAutoZeroCascade(data,entry.sourceName,{
          researched:new Set(prior),disabled:new Set(disabledBefore),...proof
        },{inventoryKnown:true,functionsKnown:false,
          activeResearchKnown:true,maxSteps:180});
        if(result.kind==="conditional"&&result.processed.includes(entry.id))
          supportedBases.push(index);
      });
    return {id:entry.id,source:entry.sourceName,
      date:day(entry),observedSourceType:2,hasZeroCostRule:Number(rule?.cost)===0,
      newAndStillCompleted:isNew,sourcePrecedesInDiary:chronology,
      candidateModelBases:supportedBases,
      verdict:Number(rule?.cost)!==0||!sourceRule||!chronology||!isNew?
        "observed-diary-but-unverified":"observed-free-after",
      // A model hit only shows consistency with a prior *base candidate*.
      // The diary lacks the base/geo assignment and cannot prove the replay.
      model:supportedBases.length?"candidate-consistent":"not-established"};
  });
  return {kind:"observed-diary-prefix",diaryPrefix:true,
    oldDiaryCount:before.length,newDiaryCount:after.length,
    appended:appended.map(e=>({id:e.id,sourceType:e.sourceType,
      source:e.sourceName||"",date:day(e)})),
    observedAutomatic,newCompleted,noLongerCompleted,newDisabled,reenabled,
    warnings,limitations:[
      "연구 일지의 동일 접두 구간은 같은 캠페인 식별자나 중간 행동의 완전성을 증명하지 않음",
      "sourceType 2는 원본 OXCE FREE_AFTER 표기이며, 기지·지리 기능과 정확한 큐 실행 순서는 별도 증명 필요",
      "모델 일치 여부는 원인 확정이 아닌 저장 상태와의 조건부 정합성"
    ]};
}
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
  if(process.argv.length!==4){
    console.error("사용법: node tools/research-diary-delta.mjs <이전.sav> <이후.sav>");
    process.exitCode=2;
  }else{
    try{
      const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
      const before=importModernSave(fs.readFileSync(process.argv[2],"utf8"),data);
      const after=importModernSave(fs.readFileSync(process.argv[3],"utf8"),data);
      // Never print input file paths, save titles, soldier identities or stock.
      console.log(JSON.stringify(compareResearchDiarySnapshots(data,before,after),null,2));
    }catch(error){
      console.error("세이브 검증 실패 (파일 경로 비공개): "+
        String(error.message||error).replace(/[A-Z]:[\\/][^\s]+/gi,"[LOCAL_PATH]"));
      process.exitCode=1;
    }
  }
}
