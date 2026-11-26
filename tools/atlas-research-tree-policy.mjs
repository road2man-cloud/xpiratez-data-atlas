// Research-tree model approved by the project owner, 2026-11-26.
// No claim of a played or economically simulated campaign is implied.
export const RESEARCH_TREE_POLICY=Object.freeze({
 schema:"ATLAS_RESEARCH_TREE_ORDINARY_EFFORT_V1",
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
  "End-stage research targets, reachable successor closure, independent replay and equivalence of full final state."
 ],
 completion:"A complete research-tree combination need not have a month-by-month economy, construction schedule or actual battle log. Abstract ordinary effort is explicit, not a hard blocker. Do not admit an intermediate route, an unsupported resource source, unresolved research branch or a fixed-depth numerical result as complete.",
 actualGameCertified:false,
 optionalEvidence:"Existing finance, construction and campaign calendar companions remain optional; no further production of those models is required for research-tree completion."
});
// Run the actual chronological producer, without economic/procurement
// simulation. Resource unlocks that affect research remain structural goals.
export const RESEARCH_TREE_PRODUCER_ARGS=Object.freeze(["--shared-only","--shared-scan=0","--attempts=0","--supply-plans=0","--supply-research=0","--terminal-follow=0"]);
