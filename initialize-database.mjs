import {readFileSync} from 'node:fs';
import {NeonAdapter} from './neon-db.js';
import {PostgresAdapter} from './local-db.js';
import {seedDemo} from './seed.js';

const connection=process.env.DATABASE_URL;
if(!connection)throw new Error('Укажите DATABASE_URL в окружении сервера.');
const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').replace(/^PRAGMA.*$/gm,'');
const db=new URL(connection).hostname.endsWith('.neon.tech')?
  new NeonAdapter(connection):await PostgresAdapter.connect(connection,schema);
try{
  const existing=await db.prepare("SELECT to_regclass('public.roles') present").first();
  if(!existing.present)await db.batch(schema.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  const count=await db.prepare("SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").first();
  if(count.total!==20)throw new Error('Структура базы отличается от начальной миграции. Проверьте схему.');
  const created=await seedDemo({DB:db});
  console.log(JSON.stringify({tables:count.total,initial_data_created:created}));
}finally{await db.close();}
