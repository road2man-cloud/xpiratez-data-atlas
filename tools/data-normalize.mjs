const PRESENTATION_RESOURCE_RE=/(?:pixel|sprite|animation|sound|vapor|icon|image|music|palette)/i;

export function isPresentationResourceKey(key){
  return typeof key==="string"&&PRESENTATION_RESOURCE_RE.test(key);
}

function escapePointerPart(x){
  return String(x).replaceAll("~","~0").replaceAll("/","~1");
}

function pointer(path){
  return "/"+path.map(escapePointerPart).join("/");
}

export function splitPresentationResources(value){
  const resources=[];
  function walk(v,path=[]){
    if(Array.isArray(v))return v.map((x,i)=>walk(x,[...path,i]));
    if(v&&typeof v==="object"){
      const out={};
      for(const [k,x] of Object.entries(v)){
        if(isPresentationResourceKey(k)){
          resources.push([pointer([...path,k]),x]);
        }else{
          out[k]=walk(x,[...path,k]);
        }
      }
      return out;
    }
    return v;
  }
  return{core:walk(value),resources};
}

export function hasPresentationResourceKey(value){
  if(Array.isArray(value))return value.some(hasPresentationResourceKey);
  if(value&&typeof value==="object"){
    for(const [k,v] of Object.entries(value)){
      if(isPresentationResourceKey(k)||hasPresentationResourceKey(v))return true;
    }
  }
  return false;
}
