import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {purchaseGateVerdict,assertForwardPurchaseGate} from "./atlas-overcap-forward-purchase-gate-v3.mjs";
const item={exists:true,buyCost:1500,generalRequires:["STR_WRENCH"],buyRequires:["STR_SHOP"],buyRequirements:[],buyRequiresBaseFunc:["SHOP"],buyRequiresCountry:null};
const world=(r=[],f=[],d=[])=>({researched:new Set(r),baseFunctions:new Set(f),disabled:new Set(d)});
test("both general and buy requirements are mandatory",()=>{
 assert.equal(purchaseGateVerdict(world(["STR_SHOP"],["SHOP"]),"STR_WRENCH",item).ok,false);
 assert.equal(purchaseGateVerdict(world(["STR_WRENCH"],["SHOP"]),"STR_WRENCH",item).ok,false);
 assert.equal(purchaseGateVerdict(world(["STR_WRENCH","STR_SHOP"],["SHOP"]),"STR_WRENCH",item).ok,true);
});
test("functions, unknown full fields and disabled research are not waived",()=>{
 assert.equal(purchaseGateVerdict(world(["STR_WRENCH","STR_SHOP"]),"STR_WRENCH",item).ok,false);
 assert.equal(purchaseGateVerdict(world(["STR_WRENCH","STR_SHOP"],["SHOP"],["STR_WRENCH"]),"STR_WRENCH",item).ok,false);
 assert.equal(purchaseGateVerdict(world(["STR_WRENCH","STR_SHOP"],["SHOP"]),"STR_WRENCH",{...item,buyRequiresCountry:"STR_COUNTRY"}).ok,false);
 const {generalRequires,...incomplete}=item;
 assert.equal(purchaseGateVerdict(world(["STR_SHOP"],["SHOP"]),"STR_WRENCH",incomplete).ok,false);
});
test("existing V2 purchase edges satisfy full gate",()=>{
 const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),g=JSON.parse(gunzipSync(fs.readFileSync("tools/data/overcap-forward-research-v2-chain-steam-e.json.gz")));
 const edges=g.edges.filter(e=>e.action.type==="sourceBuySample");
 assert(edges.length>0);
 for(const e of edges)assertForwardPurchaseGate(g.nodes[e.from],e.action,d);
});
