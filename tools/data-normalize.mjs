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

function decodePointerPart(x){
  return String(x).replaceAll("~1","/").replaceAll("~0","~");
}

export function restorePresentationResources(core,resources=[]){
  const out=structuredClone(core);
  for(const [ptr,value] of resources){
    if(typeof ptr!=="string"||!ptr.startsWith("/"))throw new Error("Invalid resource JSON pointer: "+ptr);
    const parts=ptr.slice(1).split("/").map(decodePointerPart);
    let target=out;
    for(let i=0;i<parts.length-1;i++){
      const key=Array.isArray(target)?Number(parts[i]):parts[i];
      if(target[key]==null)target[key]=/^\d+$/.test(parts[i+1])?[]:{};
      target=target[key];
    }
    const last=Array.isArray(target)?Number(parts.at(-1)):parts.at(-1);
    target[last]=structuredClone(value);
  }
  return out;
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
