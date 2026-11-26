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
  "End-stage research targets and concrete chronological replay of the same soldier. Exhaustive successor closure, global optimum and full-state equivalence are separate research questions."
 ],
 completion:"A completed modeled research line is a concrete chronological witness from foundation to a designated active terminal research goal, together with the retained traits of the same soldier. No requirement to exhaust optional successors or maximize stats. Disclose replay assumptions including unresolved real-world acquisition; do not claim a played victory or an exhaustive search.",
 actualGameCertified:false,
 optionalEvidence:"Existing finance, construction and campaign calendar companions remain optional; no further production of those models is required for research-tree completion."
});
// Run the actual chronological producer, without economic/procurement
// simulation. Resource unlocks that affect research remain structural goals.
export const RESEARCH_TREE_PRODUCER_ARGS=Object.freeze(["--shared-only","--shared-scan=0","--attempts=0","--supply-plans=0","--supply-research=0","--terminal-follow=0"]);
