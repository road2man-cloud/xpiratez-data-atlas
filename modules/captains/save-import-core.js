// Read research-only top-level sections from OXCE multi-document, plain UTF-8 YAML save.
// Do not treat in-progress base research or poppedResearch as completed research.
// No server upload, no YAML tag evaluation, no extraction of other personal save fields.
const ID=/^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
function atom(raw){
  let s=String(raw).trim().replace(/\s+#.*$/,"").trim();
  if((s[0]==='"'&&s.at(-1)==='"')||(s[0]==="'"&&s.at(-1)==="'")){
    if(s[0]==="'")s=s.slice(1,-1).replace(/''/g,"'");
    else{
      try{s=JSON.parse(s)}catch{throw new Error("지원하지 않는 YAML 문자열 따옴표 형식");}
    }
  }
  if(!ID.test(s))throw new Error("잘못된 연구 ID: "+s.slice(0,48));
  return s;
}
function items(section){
  if(!section)return [];
  const {head,lines}=section;
  if(head==="[]"||head==="null"||head==="~")return [];
  if(head.startsWith("[")&&head.endsWith("]"))
    return head.slice(1,-1).trim()?head.slice(1,-1).split(",").map(atom):[];
  if(head.trim())throw new Error("discovered 필드의 YAML 시퀀스 구조를 인식하지 못했습니다.");
  const out=[];
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed||trimmed.startsWith("#"))continue;
    const match=line.match(/^\s+-\s+(.+?)\s*$/);
    if(!match)throw new Error("discovered의 일부 행을 읽을 수 없습니다: "+trimmed.slice(0,60));
    out.push(atom(match[1]));
  }
  return out;
}
function statusMap(section){
  const out=new Map();
  if(!section)return out;
  const {head,lines}=section;
  let entries;
  if(head==="{}"||head==="null"||head==="~")return out;
  if(head.startsWith("{")&&head.endsWith("}"))
    entries=head.slice(1,-1).trim()?head.slice(1,-1).split(",").map(x=>x.trim()):[];
  else if(!head.trim())entries=lines.map(x=>x.trim()).filter(x=>x&&!x.startsWith("#"));
  else throw new Error("researchRuleStatus 맵 형식을 인식하지 못했습니다.");
  for(const entry of entries){
    const match=entry.match(/^(['"]?[\w.:-]+['"]?)\s*:\s*([+-]?\d+)\s*(?:#.*)?$/);
    if(!match)throw new Error("researchRuleStatus 행을 읽을 수 없습니다: "+entry.slice(0,60));
    out.set(atom(match[1]),Number(match[2]));
  }
  return out;
}
// Current OXCE ResearchDiaryEntry::save emits flow-style maps:
 // - {date: [year, month, day], name: STR_..., sourceType: 0..4, sourceName: ...}
 // Older block-style maps are accepted as well. Unknown diary syntax is skipped,
 // never mistaken for completed research or an authoritative disable.
function parseDiary(section,index){
  const diary=[],unknown=[],unparsed=[];
  if(!section)return {diary,unknown,unparsed};
  if(section.head==="[]"||section.head==="null"||section.head==="~")
    return {diary,unknown,unparsed};
  if(section.head.trim()){
    unparsed.push("Unsupported researchDiary header");
    return {diary,unknown,unparsed};
  }
  const collect=[];
  let record=null;
  for(const line of section.lines){
    const trimmed=line.trim();
    if(!trimmed||trimmed.startsWith("#"))continue;
    const start=line.match(/^\s+-\s+(.+)$/);
    if(start){
      if(record)collect.push(record.join(" "));
      record=[start[1].trim()];
    }else if(record){
      record.push(trimmed);
    }else{
      unparsed.push(trimmed.slice(0,65));
    }
  }
  if(record)collect.push(record.join(" "));
  for(const raw of collect){
    // Research diary fields are unique flat scalar values, except for date's
    // three-integer flow array. Match explicit YAML keys, not arbitrary strings.
    const name=raw.match(/(?:^|[\s,{])name:\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.:-]+))/);
    const date=raw.match(/(?:^|[\s,{])date:\s*\[\s*(\d{1,6})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\]/);
    const type=raw.match(/(?:^|[\s,{])sourceType:\s*(\d{1,2})(?=\s*[,}\s]|$)/);
    const source=raw.match(/(?:^|[\s,{])sourceName:\s*(?:"([^"]*)"|'([^']*)'|([^,}]*))/);
    if(!name||!date||!type){
      unparsed.push(raw.slice(0,100));
      continue;
    }
    const id=name[1]||name[2]||name[3];
    const year=Number(date[1]),month=Number(date[2]),day=Number(date[3]),sourceType=Number(type[1]);
    if(!ID.test(id)||month<1||month>12||day<1||day>31||sourceType>4){
      unparsed.push(raw.slice(0,100));
      continue;
    }
    const entry={
      id,year,month,day,
      sourceType,sourceName:(source?.[1]??source?.[2]??source?.[3]??"").trim()
    };
    if(index.byId.has(id))diary.push(entry);
    else unknown.push(entry);
  }
  return {diary,unknown,unparsed};
}
export function traceSaveDisableCauses(index,diary,disabled){
  // diary ordering is preserved from the OXCE save. This is rule-backed
  // candidate evidence, not a claim that no intervening event changed status.
  const candidate=new Map(),disabledSet=new Set(disabled);
  for(const entry of diary){
    for(const target of index.byId.get(entry.id)?.disables||[]){
      if(disabledSet.has(target))candidate.set(target,entry);
    }
  }
  return [...candidate].map(([id,source])=>({id,source}));
}

function readSections(text){
  const wanted=new Set(["discovered","researchRuleStatus","researchDiary"]);
  const header={},body={};
  let documentIndex=0,seenContent=false,capture=null;
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/);
  for(const line of lines){
    if(/^---(?:\s+#.*)?\s*$/.test(line)){
      if(seenContent)documentIndex++;
      seenContent=false;capture=null;continue;
    }
    if(/^\.\.\.(?:\s+#.*)?\s*$/.test(line)){capture=null;continue;}
    if(!line.trim()||line.trim().startsWith("#")){if(capture)capture.lines.push(line);continue;}
    seenContent=true;
    const key=line.match(/^([A-Za-z][\w-]*):(?:\s*(.*))?$/);
    if(key){
      capture=null;
      if(documentIndex===0&&["name","mods","time"].includes(key[1]))header[key[1]]=key[2]??"";
      if(documentIndex===1){
        if(["difficulty","monthsPassed","funds","bases"].includes(key[1]))body[key[1]]=true;
        if(wanted.has(key[1])){
          if(body[key[1]])throw new Error("중복된 최상위 YAML 키: "+key[1]);
          capture={head:(key[2]||"").trim(),lines:[]};
          body[key[1]]=capture;
        }
      }
      continue;
    }
    if(capture)capture.lines.push(line);
  }
  if(!body.difficulty&&!body.monthsPassed&&!body.funds&&!body.bases)
    throw new Error("OXCE .sav 두 번째 문서의 게임 상태를 확인하지 못했습니다.");
  return {header,body};
}
export function parseXpiratezSave(text,index){
  if(typeof text!=="string"||text.length<30)throw new Error("세이브 텍스트가 비어 있거나 너무 짧습니다.");
  if(text.includes("\0")||text.includes("\uFFFD"))throw new Error("텍스트형 UTF-8 YAML .sav 파일이 아닙니다.");
  const {header,body}=readSections(text);
  const rawCompleted=items(body.discovered);
  const statuses=statusMap(body.researchRuleStatus);
  const diaryResult=parseDiary(body.researchDiary,index);
  if(!body.discovered&&!body.researchRuleStatus)
    throw new Error("완료 연구와 연구 상태 필드를 모두 찾을 수 없습니다.");
  const completed=[],disabled=[],unknownCompleted=[],unknownDisabled=[],otherStatuses=[],seen=new Set();
  for(const id of rawCompleted){
    if(seen.has(id))continue;
    seen.add(id);
    if(index.byId.has(id))completed.push(id);else unknownCompleted.push(id);
  }
  for(const [id,status] of statuses){
    if(status===2){
      if(index.byId.has(id))disabled.push(id);else unknownDisabled.push(id);
    }else if(![0,1,3].includes(status))otherStatuses.push({id,status});
  }
  const overlaps=completed.filter(id=>disabled.includes(id));
  const disableCauses=traceSaveDisableCauses(index,diaryResult.diary,disabled);
  const lostChoices=diaryResult.diary.filter(entry=>disabled.includes(entry.id)&&
    !completed.includes(entry.id)&&index.byId.get(entry.id)?.disables?.length>0);
  const warnings=[];
  if(unknownCompleted.length||unknownDisabled.length)
    warnings.push("현 DB에 없는 완료 연구 "+unknownCompleted.length+"개 / 배제 연구 "+unknownDisabled.length+"개 (모드 버전 불일치 가능)");
  if(overlaps.length)warnings.push("완료와 영구 배제에 동시에 기록된 연구 "+overlaps.length+"개 (세이브 확인 필요)");
  if(otherStatuses.length)warnings.push("알 수 없는 연구 상태 코드 "+otherStatuses.length+"개");
  if(diaryResult.unparsed.length)warnings.push("연구 일지 형식 미인식 "+diaryResult.unparsed.length+"건 (완료/배제 상태는 별도로 정상 판독)");
  if(diaryResult.unknown.length)warnings.push("현 DB에 없는 연구 일지 항목 "+diaryResult.unknown.length+"건");
  if(!rawCompleted.length&&!statuses.size)warnings.push("연구 이력이 비어 있습니다. 첫날 세이브인지 확인하세요.");
  return {completed,disabled,unknownCompleted,unknownDisabled,overlaps,
    diary:diaryResult.diary,unknownDiaryCount:diaryResult.unknown.length,
    unparsedDiaryCount:diaryResult.unparsed.length,disableCauses,lostChoices,
    warnings,otherStatuses,
    meta:{name:header.name||"",mods:header.mods?"모드 정보 있음":"모드 정보 없음",
      rawCompleted:rawCompleted.length,rawStatuses:statuses.size,
      rawDiary:diaryResult.diary.length+diaryResult.unknown.length+diaryResult.unparsed.length}};
}
