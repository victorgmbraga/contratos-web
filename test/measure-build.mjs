import {readdir,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const root=new URL('../dist-browser/assets/',import.meta.url),files=[];
for(const name of (await readdir(root)).sort()) {
  if(!/\.(js|css)$/.test(name))continue;
  const bytes=await readFile(new URL(name,root));
  files.push({name,bytes:bytes.length,gzip:gzipSync(bytes).length});
}
const totals=extension=>files.filter(file=>file.name.endsWith(extension)).reduce((sum,file)=>({bytes:sum.bytes+file.bytes,gzip:sum.gzip+file.gzip}),{bytes:0,gzip:0});
console.log(JSON.stringify({files,javascript:totals('.js'),css:totals('.css')},null,2));
