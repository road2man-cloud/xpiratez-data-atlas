// Partition by origin + research branch, not individual seed: event variants
// sharing a Pareto frontier must stay in the same worker.
import {createHash} from "node:crypto";
export function pairShard(r,count){
 if(!r||!Number.isSafeInteger(count)||count<1)throw Error("Invalid pair shard");
 return createHash("sha256").update(JSON.stringify([r.origin,r.branch])).digest().readUInt32BE(0)%count;
}
