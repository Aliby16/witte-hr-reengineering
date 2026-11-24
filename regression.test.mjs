import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBody, validatedInteger, safeText, validateDate } from './security.js';

test('дата встречи отвергает несуществующие дни, лишний текст и неверное время',()=>{
  for(const value of ['2026-02-30T10:00','2026-12-01T24:00','2026-12-01T10:00text','2026-12-01T10:61','2026-12-01T10:00+14:30'])
    assert.throws(()=>validateDate(value,true),error=>error.status===400);
  assert.equal(validateDate('2028-02-29'),'2028-02-29');
  assert.equal(validateDate('2026-12-01T10:00+03:00',true),'2026-12-01T07:00:00.000Z');
  assert.equal(validateDate('2026-12-01T10:00',true),'2026-12-01T10:00:00.000Z');
});

test('текст нормализует Unicode и удаляет управляющие символы без разрыва эмодзи',()=>{
  assert.equal(safeText('  И\u0306ван\u0000\r\nОтдел\u202E '),'Йван\nОтдел');
  assert.equal(safeText('а😀б',2),'а😀');
  assert.equal(safeText({}), '');
});
import { NeonAdapter, postgresParameters, postgresRows } from './neon-db.js';
import { neonConfig } from '@neondatabase/serverless';
import worker from './worker.js';

test('ошибка содержит номер запроса, а журнал не раскрывает текст SQL',async()=>{
  const old=console.error,logs=[];console.error=(...args)=>logs.push(args);
  try{
    const response=await worker.fetch(new Request('http://localhost/api/me',{headers:{cookie:'witte_session=abc'}}),{DB:{prepare(){throw new Error('postgresql://secret:password@private SELECT sensitive');}}});
    assert.equal(response.status,500);
    const body=await response.json();assert.equal(body.request_id,response.headers.get('x-request-id'));
    assert.doesNotMatch(JSON.stringify(logs),/password|sensitive|postgresql/);
    assert.match(body.request_id,/^[0-9a-f-]{36}$/);
  }finally{console.error=old;}
});

test('метод неподходящего ресурса возвращает 405 и Allow',async()=>{
  for(const [path,method,allow]of [['/','POST','GET, HEAD'],['/api/me','POST','GET, HEAD'],['/api/login','GET','POST'],['/api/profile','DELETE','GET, HEAD, POST']]){
    const response=await worker.fetch(new Request('http://localhost'+path,{method}),{});
    assert.equal(response.status,405);assert.equal(response.headers.get('allow'),allow);
  }
});

test('защитные заголовки сохраняются для редиректа, favicon и ошибки',async()=>{
  for(const path of ['/app/dashboard','/favicon.ico','/api/me']){
    const response=await worker.fetch(new Request('http://localhost'+path),{});
    assert.equal(response.headers.get('x-frame-options'),'DENY');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }
});

test('HEAD возвращает статус и заголовки GET без тела',async()=>{
  for(const path of ['/','/assets/styles.css','/assets/client.js','/missing','/app/dashboard']){
    const get=await worker.fetch(new Request('http://localhost'+path),{});
    const head=await worker.fetch(new Request('http://localhost'+path,{method:'HEAD'}),{});
    assert.equal(head.status,get.status,path);
    assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));
    assert.equal(await head.text(),'');
  }
});

test('параметры PostgreSQL сохраняют литералы, идентификаторы и комментарии', () => {
  assert.equal(postgresParameters("SELECT ?, '?' AS \"?\", $$?$$, $body$?$body$ /* ? /* ? */ */ -- ?\n, ?"),
    "SELECT $1, '?' AS \"?\", $$?$$, $body$?$body$ /* ? /* ? */ */ -- ?\n, $2");
  assert.deepEqual(postgresRows({fields:[{name:'total',dataTypeID:20},{name:'huge',dataTypeID:20},{name:'code',dataTypeID:25}],rows:[{total:'3',huge:'9007199254740993',code:'003'}]}),
    [{total:3,huge:'9007199254740993',code:'003'}]);
});

test('адаптер Neon отправляет пакет одной атомарной HTTP-транзакцией', async () => {
  const original=neonConfig.fetchFunction,calls=[];
  neonConfig.fetchFunction=async (url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    const result={command:'SELECT',rowCount:1,rowAsArray:true,fields:[{name:'total',dataTypeID:20}],rows:[['2']]};
    return new Response(JSON.stringify(body.queries?{results:body.queries.map(()=>result)}:result));
  };
  try {
    const db=new NeonAdapter('postgresql://placeholder:placeholder@ep-example.c-9.eu-central-1.aws.neon.tech/witte_hr');
    assert.deepEqual(await db.prepare('SELECT ? total').bind(2).first(),{total:2});
    const batch=[db.prepare('UPDATE example SET value=?').bind(1),db.prepare('UPDATE example SET value=?').bind(2)];
    assert.equal(calls.length,1);
    const result=await db.batch(batch);
    assert.equal(calls.length,2);assert.equal(result.length,2);
    assert.deepEqual(calls[1].body.queries.map(q=>q.params),[['1'],['2']]);
    assert.equal(calls[1].url,'https://api.c-9.eu-central-1.aws.neon.tech/sql');
  } finally {neonConfig.fetchFunction=original;}
});

test('размер JSON ограничивается байтами UTF-8, включая кириллицу', async () => {
  const request = new Request('http://localhost/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ about: 'я'.repeat(33000) })
  });
  await assert.rejects(() => parseBody(request), error => error.status === 413);
  const small = new Request('http://localhost/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ about: 'Проверка корректного запроса' })
  });
  assert.equal((await parseBody(small)).about, 'Проверка корректного запроса');
});

test('оценка не принимает логические значения, массивы и экспоненциальную запись', () => {
  for (const value of [false, true, [], [1], {}, '1e0', '0x1']) {
    assert.throws(() => validatedInteger(value, 0, 5, 'Оценка'), error => error.status === 400);
  }
  assert.equal(validatedInteger(' 3 ', 0, 5, 'Оценка'), 3);
  assert.equal(validatedInteger(0, 0, 5, 'Оценка'), 0);
});
