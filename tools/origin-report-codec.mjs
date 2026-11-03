// Lossless, versioned storage envelope for the large chronological witness DB.
// Actual candidates, research order, branch evidence and signatures are not
// pruned or approximated. Node checks and the browser expand the same bytes.
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

export const ORIGIN_REPORT_FORMAT='xpz-origin-report-gzip-v2';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function encodeOriginReport(report){
  if(report?.kind!=='origin-provisional-witnesses'||!Array.isArray(report.records))
    throw Error('Refusing to archive a non-origin report');
  const raw=Buffer.from(JSON.stringify(report),'utf8');
  const compressed=gzipSync(raw,{level:6});
  return JSON.stringify({format:ORIGIN_REPORT_FORMAT,compression:'gzip',encoding:'base64',
    byteLength:raw.byteLength,sha256:sha(raw),payload:compressed.toString('base64')})+'\n';
}
export function decodeOriginReport(source){
  const obj=typeof source==='string'||Buffer.isBuffer(source)?
    JSON.parse(source.toString()):source;
  if(obj?.format!==ORIGIN_REPORT_FORMAT)return obj;
  if(obj.compression!=='gzip'||obj.encoding!=='base64'||typeof obj.payload!=='string')
    throw Error('Invalid origin witness archive encoding');
  const bytes=gunzipSync(Buffer.from(obj.payload,'base64'));
  if(bytes.byteLength!==obj.byteLength||sha(bytes)!==obj.sha256)
    throw Error('Origin witness archive failed uncompressed length/hash verification');
  const report=JSON.parse(bytes.toString('utf8'));
  if(report.kind!=='origin-provisional-witnesses')
    throw Error('Origin archive payload has the wrong report kind');
  return report;
}
