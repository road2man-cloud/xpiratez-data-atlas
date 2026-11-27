// Lossless storage codec. Expanded paths are the canonical hash inputs.
// V2 shares chronological prefixes and topic arrays. V1 archives stay readable.
const V1="ATLAS_RESEARCH_PATH_DICTIONARY_V1",V2="ATLAS_RESEARCH_PATH_TRIE_V2";
function requireArray(a){if(!Array.isArray(a))throw Error("Invalid research path array");return a;}
function intern(table,map,value,k){if(!map.has(k)){map.set(k,table.length);table.push(value);}return map.get(k);}
function at(table,i){if(!Number.isSafeInteger(i)||i<0||i>=table.length)throw Error("Invalid research path dictionary index");return table[i];}
function encodeIndices(xs){
 const bytes=[];
 for(let x of xs){
  if(!Number.isSafeInteger(x)||x<0||x>0xffffffff)throw Error("Invalid research topic index");
  while(x>=128){bytes.push((x%128)+128);x=Math.floor(x/128);}
  bytes.push(x);
 }
 let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.slice(i,i+8192));
 return btoa(s);
}
function decodeIndices(s,topics){
 if(typeof s!=="string")throw Error("Invalid research topic encoding");
 const bytes=atob(s),out=[];let n=0,m=1;
 for(let i=0;i<bytes.length;i++){
  const b=bytes.charCodeAt(i);n+=(b%128)*m;
  if(n>0xffffffff||m>268435456)throw Error("Research topic integer overflow");
  if(b<128){if(m!==1&&b===0)throw Error("Noncanonical research topic integer");out.push(at(topics,n));n=0;m=1;}else m*=128;
 }
 if(m!==1)throw Error("Truncated research topic integer");
 return out;
}
export function packResearchPaths(db){
 const sets=db.careerCompletion?.researchTraitSets;
 if(!sets||sets.pathCodec)return db;
 const actions=[],topics=[],am=new Map(),tm=new Map(),paths={},actionNodes=[[null,null]],prefixMap=new Map(),topicSets=[],topicMap=new Map();
 const topic=id=>{if(typeof id!=="string")throw Error("Invalid research ID");return intern(topics,tm,id,id);};
 const topicSet=ids=>{const encoded=encodeIndices(requireArray(ids).map(topic));return intern(topicSets,topicMap,encoded,encoded);};
 for(const [id,p] of Object.entries(sets.paths)){
  let prefix=0;
  for(const a of requireArray(p.actions)){
   const ai=intern(actions,am,a,JSON.stringify(a)),k=prefix+":"+ai;
   prefix=intern(actionNodes,prefixMap,[prefix,ai],k);
  }
  paths[id]={...p,actions:prefix,researched:topicSet(p.researched),disabled:topicSet(p.disabled),active:topicSet(p.active)};
 }
 sets.paths=paths;sets.pathCodec={schema:V2,actions,topics,actionNodes,topicSets};return db;
}
export function hydrateResearchPaths(db){
 const sets=db.careerCompletion?.researchTraitSets,c=sets?.pathCodec;
 if(!c)return db;
 const actions=requireArray(c.actions),topics=requireArray(c.topics),paths={};
 if(c.schema===V1){
  const expand=(a,table)=>requireArray(a).map(i=>at(table,i));
  for(const [id,p] of Object.entries(sets.paths))paths[id]={...p,actions:expand(p.actions,actions),researched:expand(p.researched,topics),disabled:expand(p.disabled,topics),active:expand(p.active,topics)};
 }else if(c.schema===V2){
  const nodes=requireArray(c.actionNodes),decoded=requireArray(c.topicSets).map(s=>decodeIndices(s,topics));
  if(nodes.length===0||JSON.stringify(nodes[0])!=="[null,null]")throw Error("Invalid research trie root");
  for(let i=1;i<nodes.length;i++){
   const [parent,ai]=requireArray(nodes[i]);if(nodes[i].length!==2||!Number.isSafeInteger(parent)||parent<0||parent>=i)throw Error("Invalid research trie parent");at(actions,ai);
  }
  function actionPath(i){
   at(nodes,i);const out=[];while(i){const [parent,ai]=nodes[i];out.push(actions[ai]);i=parent;}return out.reverse();
  }
  for(const [id,p] of Object.entries(sets.paths))paths[id]={...p,actions:actionPath(p.actions),researched:at(decoded,p.researched).slice(),disabled:at(decoded,p.disabled).slice(),active:at(decoded,p.active).slice()};
 }else throw Error("Unknown research path codec: "+c.schema);
 sets.paths=paths;delete sets.pathCodec;return db;
}
