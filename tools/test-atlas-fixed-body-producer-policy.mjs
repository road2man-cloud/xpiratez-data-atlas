import assert from "node:assert/strict";
import {selectFixedBodyProducer} from "./atlas-fixed-body-producer-policy.mjs";
const cases=[
  [
    "V111 remains V106",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V111_EXACT_LEAVES"
    },
    "v106",
    []
  ],
  [
    "V112 remains V106",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR"
    },
    "v106",
    []
  ],
  [
    "V113 auto V108",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V113_OVERCAP_PASSIVE_ARMOR"
    },
    "v108",
    [
      "--supply-mode=source"
    ]
  ],
  [
    "V114 auto V108",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V114_OVERCAP_CLOUD"
    },
    "v108",
    [
      "--supply-mode=source"
    ]
  ],
  [
    "explicit V108 migration",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "producer": "v108"
    },
    "v108",
    [
      "--supply-mode=source"
    ]
  ],
  [
    "cloud V112 migration",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "supplyMode": "preserve"
    },
    "v108",
    [
      "--supply-mode=preserve"
    ]
  ],
  [
    "cloud V114",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V114_OVERCAP_CLOUD",
      "supplyMode": "preserve"
    },
    "v108",
    [
      "--supply-mode=preserve"
    ]
  ],
  [
    "queue migration",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "overcapQueue": "queue.json",
      "overcapQueueBody": "STR_SOLDIER_HERO",
      "overcapSourceId": "x"
    },
    "v108",
    [
      "--supply-mode=source",
      "--overcap-queue=queue.json",
      "--overcap-queue-body=STR_SOLDIER_HERO",
      "--overcap-source-id=x"
    ]
  ],
  [
    "source override",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "gameRoot": "C:/game root"
    },
    "v106",
    [
      "--game-root=C:/game root"
    ]
  ],
  [
    "reject migrated ledger with V106",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V114_OVERCAP_CLOUD",
      "producer": "v106"
    },
    null,
    "V106 cannot"
  ],
  [
    "reject preserve with V106",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "producer": "v106",
      "supplyMode": "preserve"
    },
    null,
    "V106 cannot"
  ],
  [
    "reject queue with V106",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "producer": "v106",
      "overcapQueue": "queue.json"
    },
    null,
    "V106 cannot"
  ],
  [
    "reject unknown schema",
    {
      "schema": "future"
    },
    null,
    "Unsupported"
  ],
  [
    "reject unknown version",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "producer": "v999"
    },
    null,
    "Unknown producer"
  ],
  [
    "reject unknown supply",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "supplyMode": "disabled"
    },
    null,
    "Unknown supply"
  ],
  [
    "reject filter without queue",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "overcapQueueBody": "STR_SOLDIER_HERO"
    },
    null,
    "Queue filter"
  ],
  [
    "reject game root with preserve",
    {
      "schema": "COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR",
      "gameRoot": "C:/game",
      "supplyMode": "preserve"
    },
    null,
    "game-root"
  ]
];
for(const [name,input,want,detail] of cases){
 if(want===null)assert.throws(()=>selectFixedBodyProducer(input),e=>e.message.includes(detail),name);
 else {const result=selectFixedBodyProducer(input);assert.equal(result.producer,want,name);assert.deepEqual(result.args,detail,name);assert(result.file.includes(want),name);}
 console.log("PASS "+name);
}
console.log(cases.length+" cases passed");
