import assert from 'node:assert/strict';
import {finiteRecruitTrainingBudget}
  from '../public/soldiers/modern/recruit-training-cap.js';

const close=(a,b,tol=1e-10)=>{
  assert(Number.isFinite(a),'numeric result is finite');
  assert(Math.abs(a-b)<tol, a+' != '+b);
};
// Exact tri-state enumeration for small N to test the capped binomial sum
// independently from its algebraic implementation.
function brute(n,k,q,g){
  let sum=0;
  const visit=(i,selected,prob,success)=>{
    if(i===n){if(success)sum+=prob;return;}
    visit(i+1,selected,prob*(1-q),success);
    visit(i+1,selected+(selected<k?1:0),
      prob*q*(1-g),success);
    if(selected<k)visit(i+1,selected+1,prob*q*g,true);
    else visit(i+1,selected,prob*q*g,success);
  };
  visit(0,0,1,false);
  return sum;
}
for(let n=1;n<=6;n++)
  for(let k=1;k<=4;k++)
    for(const q of [0,.03,.25,.6,1])
      for(const g of [0,.1,.5,1]){
        const r=finiteRecruitTrainingBudget(n,k,q,g);
        assert.equal(r.kind,'conditional-training-cap',r.reason);
        close(r.successChance,brute(n,k,q,g));
        assert(r.successChance<=r.unlimitedChance+1e-10);
        assert(r.capOverflowChance>=0&&r.capOverflowChance<=1);
        assert(r.expectedSelectedChecks>=0&&r.expectedSelectedChecks<=k+1e-8);
        assert(r.expectedChecksUntilSuccess>=0&&
          r.expectedChecksUntilSuccess<=r.expectedSelectedChecks+1e-8);
        if(g>0)close(r.expectedChecksUntilSuccess,r.successChance/g);
      }
const check=finiteRecruitTrainingBudget(3,2,.5,.5);
close(check.successChance,.5625);
close(check.unlimitedChance,.578125);
close(check.capOverflowChance,.125);
close(check.expectedSelectedChecks,1.375);
close(check.expectedChecksUntilSuccess,1.125);
const onlyOne=finiteRecruitTrainingBudget(2,1,.5,.25);
close(onlyOne.successChance,.1875);
close(onlyOne.unlimitedChance,.234375);
close(onlyOne.capOverflowChance,.25);
close(onlyOne.expectedChecksUntilSuccess,.75);
for(const q of [0,.001,.4,.95,1])
  for(const g of [0,.00001,.4,1]){
    const last=finiteRecruitTrainingBudget(10000,100,q,g);
    assert.equal(last.kind,'conditional-training-cap');
    assert(last.successChance>=0&&last.successChance<=1);
    assert(last.unlimitedChance>=last.successChance-1e-8);
    const smaller=finiteRecruitTrainingBudget(10000,1,q,g);
    assert(smaller.successChance<=last.successChance+1e-8);
  }
close(finiteRecruitTrainingBudget(10000,1,1,.2).successChance,.2);
close(finiteRecruitTrainingBudget(10000,100,1,.2).successChance,
  1-Math.pow(.8,100));
const nearMode=finiteRecruitTrainingBudget(200,195,.99,.001);
assert(nearMode.successChance>0&&nearMode.successChance<1);
assert(nearMode.capOverflowChance>0&&nearMode.capOverflowChance<1);
assert.equal(finiteRecruitTrainingBudget(10,0,.5,.5).kind,'unverified');
assert.equal(finiteRecruitTrainingBudget(10,201,.5,.5).kind,'unverified');
assert.equal(finiteRecruitTrainingBudget(10,1,1.1,.5).kind,'unverified');
console.log('PASS finite K capped recruitment: 480 brute tri-state cases, very rare gates, upper/lower caps, binomial tail near mode');
