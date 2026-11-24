import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import worker from './worker.js';
import { SqliteAdapter, PostgresAdapter, LocalBucket } from './local-db.js';
import { NeonAdapter } from './neon-db.js';

const projectRoot=path.dirname(new URL(import.meta.url).pathname);
const runtimeDir=path.join(projectRoot,'.sites-runtime');
mkdirSync(runtimeDir,{recursive:true});
const schema=readFileSync(path.join(projectRoot,'schema.sql'),'utf8');
const database=process.env.DATABASE_URL?
  (new URL(process.env.DATABASE_URL).hostname.endsWith('.neon.tech')?
    new NeonAdapter(process.env.DATABASE_URL):await PostgresAdapter.connect(process.env.DATABASE_URL,schema)):
  new SqliteAdapter(path.join(runtimeDir,'data.sqlite'));
if(database instanceof SqliteAdapter)database.initialize(schema);
const env={DB:database,BUCKET:new LocalBucket(path.join(runtimeDir,'files'))};
const args=process.argv.slice(2);
const portIndex=args.indexOf('--port');
const hostIndex=args.indexOf('--host');
const port=Number(portIndex>=0?args[portIndex+1]:(process.env.PORT||3000));
const host=hostIndex>=0?args[hostIndex+1]:(process.env.HOST||'0.0.0.0');
const server=createServer(async(incoming,outgoing)=>{
  try {
    const url=`http://${incoming.headers.host||`localhost:${port}`}${incoming.url}`;
    const headers=new Headers();
    for(const [key,value]of Object.entries(incoming.headers)){
      if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    }
    const options={method:incoming.method,headers};
    if(!['GET','HEAD'].includes(incoming.method)){
      options.body=Readable.toWeb(incoming);
      options.duplex='half';
    }
    const response=await worker.fetch(new Request(url,options),env,{});
    outgoing.statusCode=response.status;
    response.headers.forEach((value,key)=>outgoing.setHeader(key,value));
    if(response.body&&incoming.method!=='HEAD')Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  }catch(error){
    outgoing.statusCode=500;
    outgoing.end('Ошибка локального сервера');
    console.error(error.name,error.message);
  }
});
server.listen(port,host,()=>console.log(`Сервис запущен: http://localhost:${port}`));
async function stop(){server.close();await database.close();process.exit(0);}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
