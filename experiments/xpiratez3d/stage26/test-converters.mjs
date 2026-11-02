import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loftMesh,encodeNativeScene} from './convert-terrain.mjs';
// Transparent test shapes ensure a pass cannot rely on a prebuilt large map.
const loft=Buffer.alloc(32);
for(let y=0;y<16;y++)loft.writeUInt16LE(0xffff,y*2);
const full=loftMesh({loft:Array(12).fill(0)},loft);
assert.equal(full.voxels,16*16*12*2);
assert.equal(full.verts.length,24,'solid cube: 6 greedy quads * 4 corners');
assert.equal(full.tris.length,12,'solid cube: 6 greedy quads * 2 tris');
for(const p of full.verts)assert.ok(p.every((x,i)=>x>=0&&x<=[16,16,12][i]));
// A single x-edge-column verifies the nontrivial XCOM 15-x loft bit index.
const single=Buffer.alloc(32);
single.writeUInt16LE(0x8000,0);
const shape=loftMesh({loft:Array(12).fill(0)},single);
assert.equal(shape.voxels,24,'12 LOFT slices, each two original XCOM z voxels');
assert.ok(shape.verts.some(p=>p[0]===0));
assert.ok(shape.verts.every(p=>p[0]<=1),'leftmost bit produces leftmost occupied voxel');
const empty=loftMesh({loft:Array(12).fill(0)},Buffer.alloc(32));
assert.equal(empty.voxels,0);
assert.equal(empty.tris.length,0);
assert.throws(()=>loftMesh({loft:Array(12).fill(100)},Buffer.alloc(32)),/LOFT ID out/);
const scene={
  manifest:{source:{mapSize:[60,60,7]},
    conversion:{sourceTileMeters:1.25}},
  meshes:[{cx:0,cy:0,floor:0,material:0,verts:full.verts.flat(),
    tris:full.tris.flat(),count:1}]
};
const blob=encodeNativeScene(scene);
assert.equal(blob.subarray(0,8).toString('ascii'),'XPZ3D26A');
assert.equal(blob.readUInt32LE(8),1);
assert.equal(blob.readUInt32LE(24),1);
assert.equal(blob.readFloatLE(28),1.25);
assert.equal(blob.readUInt32LE(36+16),24);
assert.equal(blob.readUInt32LE(36+20),12);
const verticesBytes=full.verts.length*3*4;
assert.equal(blob.length,36+36+verticesBytes+full.tris.length*3*2);
console.log('STAGE26_SOURCE_GEO_TESTS_PASS full_cube=12tris voxel_orientation=verified empty=0 binary_header=v1');
