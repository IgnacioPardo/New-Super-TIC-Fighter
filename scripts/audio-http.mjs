import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
// Exercise the running Worker and imported music through actual HTTP requests.
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),origin=process.env.STF_AUDIO_ORIGIN??process.env.STF_SERVER_URL??'http://127.0.0.1:8787';
const manifest=JSON.parse(readFileSync(root+'/public/assets/manifest.json','utf8'));
const paths=[...new Set([manifest.audio.intro,manifest.audio.menu,...manifest.audio.original,...manifest.audio.remake])];
const report=[];
for(const path of paths){
 const source=readFileSync(root+'/public'+path),head=await fetch(origin+path,{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(+head.headers.get('content-length'),source.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal(head.headers.get('accept-ranges'),'bytes');assert.match(head.headers.get('cache-control'),/public, max-age=86400.*no-transform/);assert.equal(head.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(head.headers.get('x-content-type-options'),'nosniff');assert.equal(head.headers.get('content-type'),'audio/mpeg');
 const r=await fetch(origin+path,{headers:{Range:'bytes=8192-9215','Accept-Encoding':'gzip, deflate, br'}}),body=Buffer.from(await r.arrayBuffer());
 assert.equal(r.status,206);assert.equal(body.length,1024);assert.equal(r.headers.get('content-range'),`bytes 8192-9215/${source.length}`);assert.equal(+r.headers.get('content-length'),1024);assert.deepEqual(body,source.subarray(8192,9216));
 report.push({path,head:head.status,range:r.status,bytes:body.length,size:source.length});
}
const path=paths[0],source=readFileSync(root+'/public'+path),size=source.length;
const normal=await fetch(origin+path);assert.equal(normal.status,200);assert.deepEqual(Buffer.from(await normal.arrayBuffer()),source);const etag=normal.headers.get('etag');
for(const [range,status,start,end] of [
 ['bytes=0-1',206,0,1],['bytes=0-',206,0,size-1],['bytes=8192-',206,8192,size-1],['bytes=-1024',206,size-1024,size-1],['bytes=-99999999999999999999999',206,0,size-1],
 [`bytes=${size-3}-${size+30}`,206,size-3,size-1],[`bytes=${size}-`,416],['bytes=-0',416],['bytes=9-1',416],['bytes=99999999999999999999999-',416],
 ['bananas=0-1',200],['bytes=banana',200],['bytes=0-1,9-10',200]
]){
 const r=await fetch(origin+path,{headers:{Range:range}}),body=Buffer.from(await r.arrayBuffer());assert.equal(r.status,status,range);
 if(status===206){assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${size}`);assert.deepEqual(body,source.subarray(start,end+1))}
 if(status===416){assert.equal(r.headers.get('content-range'),`bytes */${size}`);assert.equal(body.length,0);assert.equal(r.headers.get('content-length'),'0')}
 if(status===200)assert.deepEqual(body,source);
 report.push({range,status:r.status,bytes:body.length});
}
for(const [validator,status] of [[etag,206],['"different-file"',200],['W/'+etag,200]]){
 const r=await fetch(origin+path,{headers:{Range:'bytes=8192-9215','If-Range':validator}}),body=Buffer.from(await r.arrayBuffer());assert.equal(r.status,status);assert.equal(body.length,status===206?1024:size);report.push({ifRange:validator,status:r.status})
}
const conditional=await fetch(origin+path,{headers:{Range:'bytes=8192-9215','If-None-Match':etag}});assert.equal(conditional.status,304);assert.equal((await conditional.arrayBuffer()).byteLength,0);
const headRange=await fetch(origin+path,{method:'HEAD',headers:{Range:'bytes=0-1'}});assert.equal(headRange.status,200);assert.equal(+headRange.headers.get('content-length'),size);assert.equal((await headRange.arrayBuffer()).byteLength,0);
const image=await fetch(origin+manifest.logo,{method:'HEAD'});assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\//);
const missing=await fetch(origin+'/assets/audio/missing.mp3',{headers:{Range:'bytes=0-1'}});assert.match(missing.headers.get('content-type'),/^text\/html/);assert.equal(missing.headers.get('content-range'),null);await missing.body.cancel();
mkdirSync(root+'/tmp/qa',{recursive:true});
writeFileSync(process.env.STF_AUDIO_REPORT??root+'/tmp/qa/audio-http.json',JSON.stringify(report,null,2));console.log('HTTP checks passed:',paths.length,'MP3 assets; full GET/HEAD, exact ranged bytes, prefix/open/suffix/clamped/huge/416/malformed/If-Range/304; non-MP3 asset preserved.');
