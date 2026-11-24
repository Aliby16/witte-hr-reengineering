import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBody, validatedInteger, safeText } from './security.js';

test('текст нормализует Unicode и удаляет управляющие символы без разрыва эмодзи',()=>{
  assert.equal(safeText('  И\u0306ван\u0000\r\nОтдел\u202E '),'Йван\nОтдел');
  assert.equal(safeText('а😀б',2),'а😀');
  assert.equal(safeText({}), '');
});
import { NeonAdapter, postgresParameters, postgresRows } from './neon-db.js';
import { neonConfig } from '@neondatabase/serverless';

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
