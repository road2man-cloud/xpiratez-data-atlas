// Exact binomial thinning for *independent hypothetical newborn rolls*.
// At most K selected newborns are sent to the same registered stat-gate path,
// in the order they appear among N recruits.  Each such path has conditional
// stat-only eligibility g.  Training success / costs and research access are
// NOT inferred from these probabilities.
const integer=Number.isSafeInteger;
const validProbability=x=>Number.isFinite(x)&&x>=0&&x<=1;
const clamp=x=>Math.max(0,Math.min(1,x));
const logFactorials=[0];
function logFactorial(n){
  for(let i=logFactorials.length;i<=n;i++)
    logFactorials[i]=logFactorials[i-1]+Math.log(i);
  return logFactorials[n];
}
function binomialMass(n,k,p){
  if(k<0||k>n)return 0;
  if(p===0)return k===0?1:0;
  if(p===1)return k===n?1:0;
  const log=logFactorial(n)-logFactorial(k)-logFactorial(n-k)+
    k*Math.log(p)+(n-k)*Math.log1p(-p);
  return Math.exp(log);
}
const atLeastOnce=(p,n)=>p===0?0:p===1?1:
  clamp(-Math.expm1(n*Math.log1p(-p)));

/**
 * P(at least one stat-gate success among the first min(S,K) selected recruits),
 * where S~Binomial(N,q), g=P(gate|selected), N=independent recruits.
 * All probability calculations are finite sums (not Monte Carlo).
 *
 * Distinguishes screening from a separate cap on *how many selected newborns*
 * can be checked through the path. K is not an inferred training resource count.
 */
export function finiteRecruitTrainingBudget(draws,trainingSlots,screenProbability,gateProbability){
  if(!integer(draws)||draws<1||draws>10000||
    !integer(trainingSlots)||trainingSlots<1||trainingSlots>200||
    !validProbability(screenProbability)||!validProbability(gateProbability))
    return {kind:'unverified',reason:'독립 신규 추첨 횟수 1~10000, 검토 인원 1~200, 두 확률 0~1 필요'};
  const q=screenProbability,g=gateProbability,cap=Math.min(trainingSlots,draws);
  const unlimited=atLeastOnce(q*g,draws);
  if(cap>=draws){
    return {kind:'conditional-training-cap',draws,trainingSlots,
      successChance:unlimited,unlimitedChance:unlimited,
      capOverflowChance:0,expectedSelectedChecks:draws*q,
      expectedChecksUntilSuccess:g>0?unlimited/g:draws*q};
  }
  if(q===0||g===0){
    // Even when the gate success is impossible, screening may still saturate
    // the limited queue; calculate saturation below rather than assuming zero.
  }
  let below=0,selectedMeanBelow=0,successBelow=0,overflowAtOrBelow=0;
  const logFail=g===1?-Infinity:Math.log1p(-g);
  for(let s=0;s<cap;s++){
    const weight=binomialMass(draws,s,q);
    below+=weight;
    selectedMeanBelow+=s*weight;
    const success=s===0||g===0?0:g===1?1:-Math.expm1(s*logFail);
    successBelow+=weight*success;
  }
  const atLeastCap=clamp(1-below);
  const successAtCap=g===0?0:g===1?1:-Math.expm1(cap*logFail);
  const successChance=clamp(successBelow+atLeastCap*successAtCap);
  const exactCap=binomialMass(draws,cap,q);
  const overflow=clamp(atLeastCap-exactCap);
  const expectedSelectedChecks=selectedMeanBelow+cap*atLeastCap;
  return {kind:'conditional-training-cap',draws,trainingSlots,
    successChance,unlimitedChance:unlimited,capOverflowChance:overflow,
    expectedSelectedChecks,
    expectedChecksUntilSuccess:g>0?Math.min(expectedSelectedChecks,successChance/g):
      expectedSelectedChecks};
}
