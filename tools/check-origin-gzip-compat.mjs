// The 210 MB uncompressed Soldier research witness archive has to retain
// identical bytes in both modern and non-DecompressionStream browsers.
// Use small fixtures here; complete 72-origin integrity checks remain separate.
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {inflateArchivedGzip} from '../public/soldiers/modern/origin-gzip-compat.js';

const raw=new TextEncoder().encode(JSON.stringify({kind:'origin-provisional-witnesses',
  records:[{profileId:'direct:TEST',stats:{tu:10},steps:[1,2,3]}]}));
const zipped=new Uint8Array(gzipSync(raw));
assert.deepEqual(await inflateArchivedGzip(zipped),raw,
  'Native browser DecompressionStream must preserve exact witness bytes');
const previous=globalThis.DecompressionStream;
try{
  globalThis.DecompressionStream=undefined;
  assert.deepEqual(await inflateArchivedGzip(zipped),raw,
    'Bundled offline inflater must reproduce exactly the same bytes');
  assert.deepEqual(await inflateArchivedGzip(zipped),raw,
    'Repeated legacy decoding cannot reuse a stale or truncated buffer');
  await assert.rejects(inflateArchivedGzip(new Uint8Array([1,2,3])),
    'Truncated/invalid gzip must not silently become proof');
}finally{globalThis.DecompressionStream=previous;}
console.log('PASS native and offline no-DecompressionStream gzip: byte-exact, repeatable and corrupted-data rejection');
