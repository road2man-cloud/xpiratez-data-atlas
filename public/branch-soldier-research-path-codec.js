// Lossless storage codec. The expanded path remains the canonical hash input.
// Only the shared registry's repeated research paths are encoded; IDs and
// all replay evidence remain unchanged. Unknown codecs fail closed.
const CODEC="ATLAS_RESEARCH_PATH_DICTIONARY_V1";
function requireArray(a){if(!Array.isArray(a))throw Error("Invalid research path array");return a;}
function intern(table,map,value,k){if(!map.has(k)){map.set(k,table.length);table.push(value);}return map.get(k);}
export function packResearchPaths(db){
 const sets=db.careerCompletion?.researchTraitSets;
 if(!sets||sets.pathCodec)return db;
 const actions=[],topics=[],am=new Map(),tm=new Map(),paths={};
 const topic=id=>{if(typeof id!=="string")throw Error("Invalid research ID");return intern(topics,tm,id,id);};
 for(const [id,p] of Object.entries(sets.paths)){
  paths[id]={...p,actions:requireArray(p.actions).map(a=>intern(actions,am,a,JSON.stringify(a))),researched:requireArray(p.researched).map(topic),disabled:requireArray(p.disabled).map(topic),active:requireArray(p.active).map(topic)};
 }
 sets.paths=paths;sets.pathCodec={schema:CODEC,actions,topics};return db;
}
export function hydrateResearchPaths(db){
 const sets=db.careerCompletion?.researchTraitSets,c=sets?.pathCodec;
 if(!c)return db;
 if(c.schema!==CODEC)throw Error("Unknown research path codec: "+c.schema);
 const actions=requireArray(c.actions),topics=requireArray(c.topics),paths={};
 function expand(a,table){return requireArray(a).map(i=>{if(!Number.isSafeInteger(i)||i<0||i>=table.length)throw Error("Invalid research path dictionary index");return table[i];});}
 for(const [id,p] of Object.entries(sets.paths)){
  paths[id]={...p,actions:expand(p.actions,actions),researched:expand(p.researched,topics),disabled:expand(p.disabled,topics),active:expand(p.active,topics)};
 }
 sets.paths=paths;delete sets.pathCodec;return db;
}
