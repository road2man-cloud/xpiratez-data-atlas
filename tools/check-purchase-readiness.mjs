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
assert.equal(absent.counts.unknown,5,'Never mark omitted research, storage or checkout as completed');
assert.equal(absent.requestedQuantity,1);
assert.equal(gate(absent,'storage',r.id).status,'unknown');

const failed=evalBuy(r,{research:{STR_RETICULAN_ELECTROGUN:'yes',
  STR_CONTACT_RETICULANS:'no'}});
assert.equal(failed.status,'blocked');
assert.equal(gate(failed,'research','STR_RETICULAN_ELECTROGUN').status,'pass');
assert.equal(gate(failed,'research','STR_CONTACT_RETICULANS').status,'blocked');

const allResearch={STR_RETICULAN_ELECTROGUN:'yes',STR_CONTACT_RETICULANS:'yes'};
const candidate=evalBuy(r,{research:allResearch,storeVisibleByItem:{[r.id]:'yes'},
  checkoutPriceByItem:{[r.id]:5000},funds:6000,freeStoreSpace:10});
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
  baseFunctions:{FACILITY:'yes'},countryPacts:{COUNTRY:'no'},
  purchasedThisMonthByItem:{DUPLICATE:1},storeVisibleByItem:{DUPLICATE:'yes'},
  funds:30,checkoutPriceByItem:{DUPLICATE:30}
});
assert.equal(allGateReport.status,'conditional');
assert.equal(allGateReport.counts.unknown,0);
assert.equal(allGateReport.gates.length,8);
assert.equal(gate(allGateReport,'country-pact','COUNTRY').status,'pass');
assert.equal(gate(evalBuy({id:'COUNTRY_TEST',costBuy:10,requiresBuyCountry:'COUNTRY'},
  {countryPacts:{COUNTRY:'yes'}}),'country-pact','COUNTRY').status,'blocked',
  'OXCE requiresBuyCountry blocks the listed country when getPact() is true');
assert.equal(gate(evalBuy({id:'COUNTRY_TEST',costBuy:10,requiresBuyCountry:'COUNTRY'},
  {countryPacts:{COUNTRY:'no'}}),'country-pact','COUNTRY').status,'pass');
assert.equal(gate(evalBuy({id:'COUNTRY_TEST',costBuy:10,requiresBuyCountry:'COUNTRY'},
  {alliedCountries:{COUNTRY:'yes'}}),'country-pact','COUNTRY').status,'unknown',
  'An obsolete alliance field must not be interpreted as proof of no Pact');

// A single-item purchase test must not green-light orders of ten items.
const bulk={id:'BULK_ITEM',costBuy:100,storageSize:2,monthlyBuyLimit:6};
const buyState={storeVisibleByItem:{BULK_ITEM:'yes'},checkoutPriceByItem:{BULK_ITEM:100},
  funds:650,freeStoreSpace:9,purchasedThisMonthByItem:{BULK_ITEM:2}};
const single=evalBuy(bulk,buyState);
assert.equal(single.status,'conditional');
assert.equal(single.totalPrice,100);
const bulkFive=evalBuy(bulk,{...buyState,requestedQuantity:5});
assert.equal(bulkFive.status,'blocked');
assert.equal(gate(bulkFive,'monthly',bulk.id).status,'blocked');
assert.equal(gate(bulkFive,'storage',bulk.id).status,'blocked');
assert.equal(gate(bulkFive,'funds',bulk.id).status,'pass');
assert.equal(bulkFive.totalPrice,500);
const bulkSeven=evalBuy(bulk,{...buyState,requestedQuantity:7});
assert.equal(gate(bulkSeven,'funds',bulk.id).status,'blocked');
const bulkFour=evalBuy(bulk,{...buyState,requestedQuantity:4});
assert.equal(bulkFour.status,'conditional');
assert.equal(gate(bulkFour,'monthly',bulk.id).status,'pass');
assert.equal(gate(bulkFour,'storage',bulk.id).status,'pass');
assert.equal(bulkFour.totalPrice,400);
const badQuantity=evalBuy(bulk,{...buyState,requestedQuantity:0});
assert.equal(badQuantity.status,'unverified',
  'Zero requested quantity must not be silently upgraded to 1');
assert.equal(gate(badQuantity,'quantity',bulk.id).status,'unknown');
assert.equal(gate(badQuantity,'funds',bulk.id).status,'unknown');
assert.equal(gate(badQuantity,'monthly',bulk.id).status,'unknown');
assert.equal(gate(badQuantity,'storage',bulk.id).status,'unknown');
const lacksStore=evalBuy(bulk,{...buyState,freeStoreSpace:null});
assert.equal(lacksStore.status,'unverified');
assert.equal(gate(lacksStore,'storage',bulk.id).status,'unknown');
const storageEdge=evalBuy(bulk,{...buyState,freeStoreSpace:1.97});
assert.equal(gate(storageEdge,'storage',bulk.id).status,'unknown',
  'Engine store rounding tolerance must never cause a false blocked verdict');

const live=buy('STR_WHITERABBIT');
assert(live.liveAlien&&live.prisonType===2&&live.storageSize>0);
const liveUnknown=evalBuy(live);
assert.equal(gate(liveUnknown,'containment','2').status,'unknown');
const liveState={storeVisibleByItem:{[live.id]:'yes'},requestedQuantity:2,
  freeContainmentByType:{2:1},freeStoreSpace:20,funds:10000,
  checkoutPriceByItem:{[live.id]:100}};
assert.equal(gate(evalBuy(live,liveState),'containment','2').status,'blocked');
assert.equal(gate(evalBuy(live,{...liveState,freeContainmentByType:{2:2}}),
  'containment','2').status,'pass');
assert.equal(gate(evalBuy(live,{...liveState,freeContainmentByType:{0:100}}),
  'containment','2').status,'unknown',
  'Containment type 0 is not a substitute for type 2');

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
