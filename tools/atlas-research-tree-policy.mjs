// Research-tree model approved by the project owner, 2026-11-26.
// No claim of a played or economically simulated campaign is implied.
export const RESEARCH_TREE_POLICY=Object.freeze({
 schema:"ATLAS_RESEARCH_TREE_ORDINARY_EFFORT_V2_FINAL_CLOSURE",
 scope:"Complete feasible research and soldier development combinations, not a full campaign economy or tactical simulator.",
 abstractOrdinaryEffort:[
  "Repeatably obtainable ordinary materials and money: assume acquisition, retain relevant unlock requirements.",
  "Buildable facilities: assume construction after prerequisites; retain facility identity, research, structural impossibility and exclusive restrictions.",
  "Repeatable combat: assume growth to the actual current body combat cap, respecting stat granularity, disabled growth and existing above-cap values.",
  "Repeatable score accumulation and ordinary play: assume sufficient effort where possible; retain deadlines, exclusive outcomes and finite opportunities."
 ],
 retainHardGates:[
  "Research dependency, requires, disables, reenables, lookup, free research and mutually exclusive choice chronology.",
  "Recruitment, body, transformation, trait counts, reset, history, rank and exact stat thresholds.",
  "Finite/unique rewards, item grants with exclusive sources, time windows, limited repetitions and unknown acquisition sources.",
  "End-stage research targets, chronological replay of the same soldier and successor closure are required for final row admission. Global optimality and actual game victory remain separate."
 ],
 completion:"A terminal research witness is an exploration state until all future relevant research, soldier development transitions, loss, reset, transformation and finite-material possibilities have been resolved. No artificial action-depth or trait-count ceiling. Equivalent final outcomes share one research-path and trait-set row; retain exact ordered witnesses. Unknown or time-limited search is never final.",
 actualGameCertified:false,
 optionalEvidence:"Existing finance, construction and campaign calendar companions remain optional; no further production of those models is required for research-tree completion."
});
// Run the actual chronological producer, without economic/procurement
// simulation. Resource unlocks that affect research remain structural goals.
export const RESEARCH_TREE_PRODUCER_ARGS=Object.freeze(["--shared-only","--shared-scan=0","--attempts=0","--supply-plans=0","--supply-research=0","--terminal-follow=0"]);
