// Gzip reader for archived research witnesses. Native streaming remains the
// default; the lightweight, bundled MIT/Zlib inflater is only loaded by
// browsers without DecompressionStream. No external network/CDN dependency.
export async function inflateArchivedGzip(zipped){
  if(!(zipped instanceof Uint8Array))throw Error('Invalid compressed origin bytes');
  if(typeof DecompressionStream==='function'){
    const buffer=await new Response(new Blob([zipped]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return new Uint8Array(buffer);
  }
  await import('../../vendor/pako-inflate-2.1.0.min.js');
  const ungzip=globalThis.pako?.ungzip;
  if(typeof ungzip!=='function')throw Error('Offline gzip reader is unavailable');
  return ungzip(zipped);
}
