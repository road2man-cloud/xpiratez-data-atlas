// Compressed static assets work on hosts without Content-Encoding configuration.
// Older browsers fetch the equivalent JSON. Failed requests are retryable.
const requests=new Map();
const fallbacks={
  "crafts-runtime":"progression","soldiers-runtime":"soldiers-index","soldiers-builds":"soldiers-index",
  "trainings-runtime":"trainings-index","training-raw-rules":"trainings-index",
  "manufacture-search":"manufacture-index","manufacture-runtime":"manufacture-index","soldier-research-labels":"progression-research"
};
export function loadRuntime(url){
  if(!requests.has(url))requests.set(url,(async()=>{
    if(typeof DecompressionStream!=='undefined'){
      const gzUrl=url.replace(/\.json(?=\?|$)/,'.json.gz');
      try{
        const compressed=await fetch(gzUrl);
        if(compressed.ok)return await new Response(compressed.body.pipeThrough(new DecompressionStream('gzip'))).json();
      }catch{ /* Use canonical source if gzip is unavailable or damaged. */ }
    }
    const rawUrl=url.replace(/([^/]+)\.json(?=\?|$)/,(match,name)=>(fallbacks[name]||name)+'.json');
    const response=await fetch(rawUrl);
    if(!response.ok)throw new Error(rawUrl+' HTTP '+response.status);
    const body=await response.json();
    if(url.includes('/manufacture-search.json'))return {search:Object.fromEntries(body.index.map(row=>[row.id,row.searchText]))};
    if(url.includes('/training-raw-rules.json'))return {rawRules:Object.fromEntries(body.transformations.map(t=>[t.id,t.rawRule]))};
    return body;
  })().catch(error=>{requests.delete(url);throw error;}));
  return requests.get(url);
}
export function debounce(callback,ms=100){let timer;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>callback(...args),ms);};}
export async function yieldToBrowser(){
  if(globalThis.scheduler?.yield)return scheduler.yield();
  await new Promise(resolve=>setTimeout(resolve,0));
}
