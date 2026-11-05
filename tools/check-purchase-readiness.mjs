import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluatePurchaseReadiness as evalBuy} from '../public/items/purchase-readiness.js';

const indexed=JSON.parse(fs.readFileSync('public/items/acquisition-index.json','utf8'));
const buy=id=>{const item=indexed.items[id];assert(item,'unknown item '+id);return item};
const gate=(report,kind,id)=>report.gates.find(x=>x.kind===kind&&x.id===id);
const r=buy('STR_RETICULAN_ELECTROGUN');
assert.deepEqual(r.requires,['STR_RETICULAN_ELECTROGUN']);
assert.deepEqual(r.requiresBuy,['STR_CONTACT_RETICULANS']);
const absent=evalBuy(r);
assert.equal(absent.status,'unverified');
assert.equal(absent.counts.blocked,0);
assert.equal(absent.counts.unknown,4,'Never mark omitted save flags as uncompleted');

const failed=evalBuy(r,{research:{STR_RETICULAN_ELECTROGUN:'yes',
  STR_CONTACT_RETICULANS:'no'}});
assert.equal(failed.status,'blocked');
assert.equal(gate(failed,'research','STR_RETICULAN_ELECTROGUN').status,'pass');
assert.equal(gate(failed,'research','STR_CONTACT_RETICULANS').status,'blocked');

const allResearch={STR_RETICULAN_ELECTROGUN:'yes',STR_CONTACT_RETICULANS:'yes'};
const candidate=evalBuy(r,{research:allResearch,storeVisibleByItem:{[r.id]:'yes'},
  checkoutPriceByItem:{[r.id]:5000},funds:6000});
assert.equal(candidate.status,'conditional',
  'Do not certify runtime purchasability from manually entered evidence');
assert.equal(candidate.counts.unknown,0);
assert.equal(candidate.sourceVerifiedStoreListing,false);
assert.equal(candidate.exactEngineBuildVerified,false);
assert(candidate.gates.every(x=>x.status==='pass'));

const noFunds=evalBuy(r,{research:allResearch,storeVisibleByItem:{[r.id]:'yes'},
  checkoutPriceByItem:{[r.id]:5000},funds:4000});
assert.equal(noFunds.status,'blocked');
assert.equal(gate(noFunds,'funds',r.id).status,'blocked');

const basePriceIsNotCheckout=evalBuy(r,{research:allResearch,
  storeVisibleByItem:{[r.id]:'yes'},funds:0});
assert.equal(gate(basePriceIsNotCheckout,'funds',r.id).status,'unknown',
  'Base price must never be used to declare a payment impossible');
assert.equal(basePriceIsNotCheckout.status,'unverified');

const absentListing=evalBuy(r,{research:allResearch,
  storeVisibleByItem:{[r.id]:'no'},checkoutPriceByItem:{[r.id]:5000},funds:6000});
assert.equal(absentListing.status,'blocked');
assert.equal(gate(absentListing,'listing',r.id).status,'blocked');

const med=buy('STR_LOOTBOX_MEDICAL');
const limit=evalBuy(med,{purchasedThisMonthByItem:{[med.id]:1}});
assert.equal(gate(limit,'monthly',med.id).status,'blocked');
assert.equal(limit.status,'blocked');
assert.equal(gate(limit,'base-function','STR_MED_TRADE').status,'unknown');
const baseFailure=evalBuy(med,{baseFunctions:{STR_MED_TRADE:'no'},
  purchasedThisMonthByItem:{[med.id]:0}});
assert.equal(gate(baseFailure,'base-function','STR_MED_TRADE').status,'blocked');
assert.equal(gate(baseFailure,'monthly',med.id).status,'pass');
const noBuy=evalBuy(buy('SPC_CUM_OR_ELSE'));
assert.equal(noBuy.status,'not-indexed');

const duplicates=evalBuy({id:'DUPLICATE',costBuy:30,
  requires:['RESEARCH_A'],requiresBuy:['RESEARCH_A','RESEARCH_B'],
  requiresBuyBaseFunc:['FACILITY'],requiresBuyCountry:'COUNTRY',monthlyBuyLimit:2});
assert.equal(duplicates.gates.filter(x=>x.kind==='research').length,2,
  'An AND purchase requirement shared by requires and requiresBuy must not repeat');
const allGateReport=evalBuy({id:'DUPLICATE',costBuy:30,
  requires:['RESEARCH_A'],requiresBuy:['RESEARCH_A','RESEARCH_B'],
  requiresBuyBaseFunc:['FACILITY'],requiresBuyCountry:'COUNTRY',monthlyBuyLimit:2},{
  research:{RESEARCH_A:'yes',RESEARCH_B:'yes'},
  baseFunctions:{FACILITY:'yes'},alliedCountries:{COUNTRY:'yes'},
  purchasedThisMonthByItem:{DUPLICATE:1},storeVisibleByItem:{DUPLICATE:'yes'},
  funds:30,checkoutPriceByItem:{DUPLICATE:30}
});
assert.equal(allGateReport.status,'conditional');
assert.equal(allGateReport.counts.unknown,0);
assert.equal(allGateReport.gates.length,7);

let verified=0;
for(const item of Object.values(indexed.items)){
  if(!(item.costBuy>0))continue;
  const report=evalBuy(item);
  assert.equal(report.status,'unverified','Price-only item cannot self-certify '+item.id);
  assert.equal(report.counts.blocked,0);
  assert.equal(report.gates.filter(x=>x.kind==='research').length,
    new Set([...(item.requires||[]),...(item.requiresBuy||[])]).size);
  verified++;
}
assert.equal(verified,552);
console.log('PASS purchase readiness: 552 conservative candidates, AND research, explicit blocks, unknown save flags, monthly/functional gates, adjusted price, no false certainty');
