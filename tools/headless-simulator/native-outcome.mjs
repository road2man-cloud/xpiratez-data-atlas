#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Observational hook into ORIGINAL OXCE finishBattle(). No battle mechanics.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
function once(s,a,b,label){
  if(s.split(a).length!==2)throw new Error('UNSUPPORTED_NATIVE_OUTCOME_LAYOUT: '+label);
  return s.replace(a,b);
}
export function patchFinishBattle(src) {
  src=src.replace(/\r\n/g,'\n');
  if(src.includes('NativeOutcome::recordFinish'))throw new Error('NATIVE_OUTCOME_ALREADY_PATCHED');
  src=once(src,'#include "../Engine/Timer.h"',
    '#include "../Engine/Timer.h"\n#include "../Engine/RNG.h"\n#include "../Headless/NativeOutcome.h"','BattlescapeState includes');
  const method='void BattlescapeState::finishBattle(bool abort, int inExitArea)\n{';
  if(src.split(method).length!==2)throw new Error('UNSUPPORTED_NATIVE_OUTCOME_LAYOUT: finishBattle signature');
  const at=src.indexOf(method);
  const end='\n}\n\n/**\n * Shows the launch button.';
  const tail=src.indexOf(end,at);
  if(tail<0||src.indexOf(end,tail+1)>=0)throw new Error('UNSUPPORTED_NATIVE_OUTCOME_LAYOUT: finishBattle end');
  const observer=[
    '',
    '    // After original stage handling and debriefing/cutscene state transitions.',
    '    // Save the complete native tactical result; do not recompute victory.',
    '    if (NativeOutcome::enabled()) {',
    '        const std::uint64_t savedRng = RNG::getSeed();',
    '        _game->getSavedGame()->save("xpz-native-battle-finish.sav", _game->getMod());',
    '        if (RNG::getSeed() != savedRng)',
    '            throw std::runtime_error("NATIVE_BATTLE_FINISH_SNAPSHOT_CHANGED_RNG");',
    '        const bool nextStageStarted = !nextStage.empty() && inExitArea > 0 && !isPreview;',
    '        NativeOutcome::recordFinish(abort, inExitArea, nextStageStarted, isPreview, savedRng);',
    '    }',
    ''
  ].join('\n');
  return src.slice(0,tail)+observer+src.slice(tail);
}
export function patchOutcomeGame(src) {
  src=src.replace(/\r\n/g,'\n');
  if(src.includes('NativeOutcome::finished'))throw new Error('NATIVE_OUTCOME_ALREADY_PATCHED');
  src=once(src,'#include "Timer.h"',
    '#include "Timer.h"\n#include "../Headless/NativeOutcome.h"','Game includes');
  const point='\t\t\tnativeActive->think();';
  src=once(src,point,point+[
    '',
    '            // finishBattle() ran within the native think: quit after return.',
    '            if (NativeOutcome::finished()) {',
    '                quit();',
    '                continue;',
    '            }'
  ].join('\n'),'Game finish exit');
  // A mission can also finish during NextTurnState::close(), which is invoked
  // AFTER nativeActive->think(). Check the outcome again in that exact path.
  return once(src,'\t\t\t\t\tbanner->close();',
    '\t\t\t\t\tbanner->close();\n\t\t\t\t\tif (NativeOutcome::finished()) {\n\t\t\t\t\t\tquit();\n\t\t\t\t\t\tcontinue;\n\t\t\t\t\t}',
    'Game next-turn banner finish');
}
export function applyNativeOutcome(root) {
  const hdr=path.join(root,'src/Headless/NativeOutcome.h');
  if(fs.existsSync(hdr))throw new Error('NATIVE_OUTCOME_ALREADY_PATCHED');
  const patches=[
    ['src/Battlescape/BattlescapeState.cpp',patchFinishBattle],
    ['src/Engine/Game.cpp',patchOutcomeGame]
  ],patchedFiles={};
  for(const [relative,patch] of patches){
    const file=path.join(root,relative);
    const updated=patch(fs.readFileSync(file,'utf8'));
    fs.writeFileSync(file,updated);
    patchedFiles[relative]=sha256(Buffer.from(updated));
  }
  fs.copyFileSync(path.join(HERE,'native/NativeOutcome.h'),hdr);
  patchedFiles['src/Headless/NativeOutcome.h']=sha256(fs.readFileSync(hdr));
  return {schema:1,mode:'ORIGINAL_OXCE_FINISHBATTLE_OBSERVER',patchedFiles};
}
