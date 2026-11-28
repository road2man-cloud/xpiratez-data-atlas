import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {resumeGdxBridge} from "./replay-overcap-forward-gdx-bridge-v3.mjs";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
// Actual produced cursor, plus separate synthetic gate fixtures. Fixtures
// never enter a generated scenario or count as a completed campaign.
const c=resumeGdxBridge({scenario:"baseline",award:"STR_ALIEN_TERROR"});
const engine=createForwardResearch(c.data,{maxMonth:12}),bridge=createGdxBridge(c.data,engine,c.source);
const order1=c.source.orders[0],order2=c.source.orders[1];
const option=(w,o)=>bridge.options(w,c.root).find(x=>x.action.type==="sourceGdxOrder"&&x.action.event===o.id);
test("actual cursor cannot claim GDX orders or harvest same mission again",()=>{
 assert.equal(c.world.items.STR_SECTOID_SOLDIER,0);
 assert.equal(c.world.items.STR_BEER,0);
 assert(!bridge.options(c.world,c.root).some(x=>x.action.type==="sourceGdxCapture"||x.action.type==="sourceGdxOrder"));
 assert.deepEqual(c.orderBlockers()[0].missing,["STR_SECTOID_MEDIC","STR_ACADEMY_NURSE"]);
});
test("GDX first order needs time and all five research prerequisites; interruption blocks it",()=>{
 const w=structuredClone(c.world);w.month=4;assert(!option(w,order1));
 for(const id of order1.script.researchPositive)w.researched.add(id);
 w.month=3;assert(!option(w,order1));w.month=4;
 const x=option(w,order1);assert(x);assert.equal(x.evidence.points,-100);
 const r=bridge.apply(w,x.action,c.root);assert(r.world.researched.has(order1.research));assert.equal(r.world.forwardGdxOrders.at(-1).points,-100);
 assert(!option(r.world,order1));assert(!option(r.world,order2));
});
test("second order needs first order and month nine; free ambulance is separate",()=>{
 const w=structuredClone(c.world);for(const id of order2.script.researchPositive)w.researched.add(id);
 w.month=8;assert(!option(w,order2));w.month=9;
 w.researched.delete(order1.research);assert(!option(w,order2));w.researched.add(order1.research);
 const x=option(w,order2);assert(x);const r=bridge.apply(w,x.action,c.root);
 const n=r.world;
 if(n.pendingFree){assert.equal(n.pendingFree.source,order2.research);assert(n.pendingFree.choices.includes("STR_VESSEL_AMBULANCE"));}
 else assert(n.researched.has("STR_VESSEL_AMBULANCE"));
 assert(n.researched.has(order2.research)||n.pendingFree?.source===order2.research);
 assert(!option(n,order2));
});
