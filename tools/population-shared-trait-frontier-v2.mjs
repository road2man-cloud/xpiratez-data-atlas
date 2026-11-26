// Open-ended heuristic scheduler. Priorities only select pending nodes;
// no state or alternate research order is removed by the priority.
const sum=v=>(v||[]).reduce((s,x)=>s+x,0);
const distinct=(a,b)=>a.filter(x=>!b.includes(x)).length;
export function createTraitFrontier(graphs,byBody,prior={},workPriority){
 const schedule={clock:prior.clock||0,turns:{...prior.turns},batches:prior.batches||0};
 const metrics={priorityBatches:0,fairBatches:0,priorityExpanded:0,fifoExpanded:0,maxSelectedTraits:0,maxSelectedDepth:0};
 const available=g=>g.cursor<g.nodes.length&&!g.blocker;
 function score(g,i){
  const n=g.nodes[i],root=g.nodes[0],parent=g.nodes[n.parent]||root;
  const novel=distinct(n.traits,root.traits),lost=distinct(root.traits,n.traits);
  const prospective=new Set((byBody.get(n.body)||[]).map(r=>r.soldierBonusType).filter(t=>t&&!n.traits.includes(t))).size;
  const delta=sum(n.permanentVector)-sum(root.permanentVector),capDelta=sum(n.permanentCapVector)-sum(root.permanentCapVector);
  return n.traits.length*160+novel*30-lost*20+Math.min(60,prospective)*2+delta*.18+capDelta*.12+(sum(n.permanentVector)-sum(parent.permanentVector))*.06;
 }
 function pickNode(g,priority){
  if(!available(g))return null;
  const choices=[];for(let i=g.cursor;i<g.nodes.length;i++)if(!g.nodes[i].edges)choices.push({g,i,n:g.nodes[i]});
  return workPriority.choose(choices,(a,b)=>priority?score(g,b.i)-score(g,a.i)||a.i-b.i:a.i-b.i)?.i??null;
 }
 function pick(){
  const choices=Object.entries(graphs).filter(([,g])=>available(g));if(!choices.length)return null;
  const mode=schedule.batches%4,priority=mode!==0;
  const options=choices.map(([id,g])=>({id,g,i:pickNode(g,priority)})).filter(o=>o.i!==null).map(o=>({...o,n:o.g.nodes[o.i]}));if(!options.length)return null;
  const age=o=>schedule.turns[o.id]||0;
  const {id,g}=workPriority.choose(options,(a,b)=>mode===1||mode===3?score(b.g,b.i)-score(a.g,a.i)||age(a)-age(b)||a.id.localeCompare(b.id):age(a)-age(b)||a.id.localeCompare(b.id));schedule.turns[id]=++schedule.clock;schedule.batches++;
  metrics[priority?"priorityBatches":"fairBatches"]++;
  return {id,g,priority};
 }
 function selected(g,i,priority){
  metrics[priority?"priorityExpanded":"fifoExpanded"]++;
  metrics.maxSelectedTraits=Math.max(metrics.maxSelectedTraits,g.nodes[i].traits.length);
  let depth=0;while(i!==0){if(g.nodes[i].steps.some(a=>a.type==="transform"&&a.soldier==="origin"))depth++;i=g.nodes[i].parent;}
  metrics.maxSelectedDepth=Math.max(metrics.maxSelectedDepth,depth);
 }
 return {pick,pickNode,selected,schedule,metrics};
}
