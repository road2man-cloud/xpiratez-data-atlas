#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copies an explicitly supplied OXCE source tree into a NEW build directory.
// It does not modify the original game/source tree and implements no combat math.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_FILES = ['CMakeLists.txt','LICENSE.txt','CHANGELOG.txt','Extended.txt','README.md'];
const SOURCE_DIRS = ['src','libs','cmake','docs','res'];
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function once(text, anchor, replacement, name) {
  if (text.split(anchor).length !== 2) throw new Error('UNSUPPORTED_SOURCE_LAYOUT: ' + name);
  return text.replace(anchor, replacement);
}
export function patchBattle(text) {
  text = text.replace(/\r\n/g, '\n');
  if (text.includes('NativeReplay::tick')) throw new Error('SOURCE_ALREADY_PATCHED');
  text = once(text, '\nnamespace OpenXcom\n{', '\n#include "../Headless/ReplayDriver.h"\n\nnamespace OpenXcom\n{', 'battle namespace');
  const anchor = 'int BattlescapeGame::think()\n{';
  return once(text, anchor, anchor + '\n\t// Native replay adapter: original state machine and gameplay RNG remain in control.\n\tif (NativeReplay::enabled() && _states.empty() && !_endTurnRequested\n\t\t&& !_save->getUnitsFalling() && _save->getSide() == FACTION_PLAYER && _playerPanicHandled)\n\t{\n\t\tNativeReplay::tick(this);\n\t\treturn -1;\n\t}\n', 'battle think');
}
export function patchGame(text) {
  text = text.replace(/\r\n/g, '\n');
  if (text.includes('XPZ_NATIVE_PLAN')) throw new Error('SOURCE_ALREADY_PATCHED');
  const anchor = '\t\t// Process rendering';
  return '#include <cstdlib>\n' + once(text, anchor,
    '\t\t// Native headless mode still constructs the original UI/state objects.\n' +
    '\t\t// Only rendering is omitted; native think(), timers and AI are not replaced.\n' +
    '\t\tif (std::getenv("XPZ_NATIVE_PLAN"))\n\t\t{\n\t\t\t_states.back()->think();\n\t\t\tSDL_Delay(1);\n\t\t\tcontinue;\n\t\t}\n\n' + anchor, 'game rendering');
}
function listFiles(root, relative = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(root,relative), {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const p = path.posix.join(relative,e.name);
    if (e.isSymbolicLink()) throw new Error('SOURCE_SYMLINK_REJECTED: ' + p);
    if (e.isDirectory()) out.push(...listFiles(root,p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
export function prepare(source, output) {
  source = fs.realpathSync(source); output = path.resolve(output);
  if (output === source || output.startsWith(source + path.sep)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_ORIGINAL_SOURCE');
  if (fs.existsSync(output)) throw new Error('OUTPUT_ALREADY_EXISTS');
  for (const f of ['CMakeLists.txt','LICENSE.txt','src/Battlescape/BattlescapeGame.cpp','src/Engine/Game.cpp','src/Engine/RNG.cpp'])
    if (!fs.existsSync(path.join(source,f))) throw new Error('MISSING_NATIVE_SOURCE: ' + f);
  const files = [];
  for (const f of ROOT_FILES) if (fs.existsSync(path.join(source,f))) files.push(f);
  for (const d of SOURCE_DIRS) if (fs.existsSync(path.join(source,d))) files.push(...listFiles(source,d));
  // Validate supported insertion points before copying anything.
  const battle = patchBattle(fs.readFileSync(path.join(source,'src/Battlescape/BattlescapeGame.cpp'),'utf8'));
  const game = patchGame(fs.readFileSync(path.join(source,'src/Engine/Game.cpp'),'utf8'));
  const manifest = {schema:1,backend:'OXCE_NATIVE',parityCertified:false,sourceFiles:{}};
  for (const f of files.sort()) manifest.sourceFiles[f] = sha256(fs.readFileSync(path.join(source,f)));
  manifest.sourceTreeSha256 = sha256(JSON.stringify(manifest.sourceFiles));
  manifest.driverSha256 = sha256(fs.readFileSync(path.join(HERE,'native/ReplayDriver.h')));
  fs.mkdirSync(output,{recursive:true});
  for (const f of files) {
    const dest = path.join(output,f); fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(path.join(source,f),dest);
  }
  fs.writeFileSync(path.join(output,'src/Battlescape/BattlescapeGame.cpp'),battle);
  fs.writeFileSync(path.join(output,'src/Engine/Game.cpp'),game);
  fs.mkdirSync(path.join(output,'src/Headless'),{recursive:true});
  fs.copyFileSync(path.join(HERE,'native/ReplayDriver.h'),path.join(output,'src/Headless/ReplayDriver.h'));
  manifest.patchedFiles = Object.fromEntries(['src/Battlescape/BattlescapeGame.cpp','src/Engine/Game.cpp','src/Headless/ReplayDriver.h'].map(f=>[f,sha256(fs.readFileSync(path.join(output,f)))]));
  fs.writeFileSync(path.join(output,'native-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source,output] = process.argv.slice(2);
    if (!source || !output) throw new Error('Usage: node prepare-native.mjs OXCE_SOURCE NEW_BUILD_SOURCE_DIR');
    const m = prepare(source,output);
    console.log(JSON.stringify({backend:m.backend,sourceTreeSha256:m.sourceTreeSha256,files:Object.keys(m.sourceFiles).length,output:path.resolve(output),parityCertified:false},null,2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
