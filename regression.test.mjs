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
import { readFileSync } from 'node:fs';
import { SqliteAdapter } from './local-db.js';
import { seedDemo, DEMO_PASSWORD } from './seed.js';
import { safeReturnPath } from './client.js';

test('возврат после входа разрешает только внутренние страницы',()=>{
  for(const value of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/api/logout','/app/../api/me',null])assert.equal(safeReturnPath(value),'/app/dashboard');
  assert.equal(safeReturnPath('/app/plans?status=active'),'/app/plans?status=active');
  assert.equal(safeReturnPath('/p/vacancies'),'/p/vacancies');
});

async function fixture(t){
  const DB=new SqliteAdapter();DB.initialize(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const objects=new Map();
  const env={DB,BUCKET:{async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};
  await seedDemo(env);t.after(()=>DB.close());
  const auth={};
  const call=async(path,method='GET',body,username)=>{
    if(username&&!auth[username]){
      const response=await call('/api/login','POST',{username,password:DEMO_PASSWORD});
      assert.equal(response.status,200);const data=await response.json();
      auth[username]={cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.user.csrf_token};
    }
    const headers={origin:'http://localhost'};
    if(username){headers.cookie=auth[username].cookie;headers['x-csrf-token']=auth[username].csrf;}
    if(body&&!(body instanceof FormData))headers['content-type']='application/json';
    return worker.fetch(new Request('http://localhost'+path,{method,headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),env);
  };
  return {env,DB,call,auth};
}

test('копирование вакансии создаёт отдельный черновик с тем же профилем',async t=>{
  const {call,DB}=await fixture(t);
  assert.equal((await call('/api/clone-vacancy/student-manager','POST',{},'candidate')).status,403);
  const response=await call('/api/clone-vacancy/student-manager','POST',{},'hr');
  assert.equal(response.status,201);const {id}=await response.json();
  assert.equal((await DB.prepare('SELECT status FROM vacancies WHERE id=?').bind(id).first()).status,'draft');
  assert.equal((await DB.prepare('SELECT COUNT(*) total FROM vacancy_competencies WHERE vacancy_id=?').bind(id).first()).total,5);
});

test('пустое обязательное поле при изменении вакансии отклоняется',async t=>{
  const {call,DB}=await fixture(t);
  const response=await call('/api/vacancy/student-manager','POST',{version:1,status:'published',title:'   '},'hr');
  assert.equal(response.status,400);
  assert.equal((await DB.prepare('SELECT version FROM vacancies WHERE id=?').bind('student-manager').first()).version,1);
});

test('ошибочный статус вакансии не превращается в публикацию',async t=>{
  const {call,DB}=await fixture(t);
  const body={title:'Проверка вакансии',department_id:'it',description:'Подробное описание обязанностей сотрудника',requirements:'Конкретные требования к сотруднику',status:'typo'};
  assert.equal((await call('/api/vacancies','POST',body,'hr')).status,400);
  delete body.status;const created=await(await call('/api/vacancies','POST',body,'hr')).json();
  assert.equal((await DB.prepare('SELECT status FROM vacancies WHERE id=?').bind(created.id).first()).status,'draft');
});

test('массовое прочтение изменяет только собственные непрочитанные уведомления',async t=>{
  const {call,DB}=await fixture(t);
  await DB.prepare('INSERT INTO notifications (id,user_id,title,body,created_at) VALUES (?,?,?,?,?)').bind('notice-other','candidate','Заголовок','Сообщение','2026-01-01').run();
  assert.equal((await call('/api/notices/read-all','POST',{},'candidate3')).status,200);
  assert.equal((await DB.prepare('SELECT read_at FROM notifications WHERE id=?').bind('notice-other').first()).read_at,null);
});

test('повторное прочтение сохраняет первую дату и не меняет чужую запись',async t=>{
  const {call,DB}=await fixture(t);
  await DB.prepare('INSERT INTO notifications (id,user_id,title,body,read_at,created_at) VALUES (?,?,?,?,?,?)').bind('notice-read','candidate','Заголовок','Сообщение','2020-01-01T00:00:00.000Z','2020-01-01').run();
  assert.equal((await call('/api/read-notice/notice-read','POST',{},'candidate')).status,200);
  assert.equal((await call('/api/read-notice/notice-read','POST',{},'candidate2')).status,404);
  assert.equal((await DB.prepare('SELECT read_at FROM notifications WHERE id=?').bind('notice-read').first()).read_at,'2020-01-01T00:00:00.000Z');
});

test('просроченные задания в обзоре изолированы по владельцу',async t=>{
  const {call,DB}=await fixture(t);
  await DB.prepare("UPDATE adaptation_tasks SET due_date='2020-01-01',status='todo'").run();
  const own=await(await call('/api/dashboard','GET',undefined,'candidate3')).json();
  const other=await(await call('/api/dashboard','GET',undefined,'candidate')).json();
  assert.ok(own.overdue_tasks.length>0);assert.equal(other.overdue_tasks.length,0);
  assert.ok(own.overdue_tasks.every(task=>task.employee_id==='candidate-3'));
});

test('число одновременно активных сессий ограничено пятью',async t=>{
  const {call,DB}=await fixture(t);let cookie;
  for(let i=0;i<7;i++){
    const response=await call('/api/login','POST',{username:'candidate',password:DEMO_PASSWORD});
    assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];
  }
  assert.equal((await DB.prepare('SELECT COUNT(*) total FROM sessions WHERE user_id=?').bind('candidate').first()).total,5);
  const response=await worker.fetch(new Request('http://localhost/api/me',{headers:{cookie}}),{DB});
  assert.equal((await response.json()).user.username,'candidate');
});

test('список сессий содержит только собственные входы и не раскрывает токены',async t=>{
  const {call}=await fixture(t);
  await call('/api/me','GET',undefined,'hr');
  const response=await call('/api/sessions','GET',undefined,'candidate');
  const {rows}=await response.json();assert.equal(rows.length,1);assert.equal(rows[0].current_session,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['current_session','expires_at']);
  assert.equal((await call('/api/sessions')).status,401);
});

test('завершение других сессий сохраняет текущую и чужую учётную запись',async t=>{
  const {call,DB}=await fixture(t);
  await call('/api/login','POST',{username:'candidate',password:DEMO_PASSWORD});
  await call('/api/me','GET',undefined,'hr');
  const response=await call('/api/sessions/revoke-others','POST',{},'candidate');
  assert.equal(response.status,200);assert.equal((await response.json()).revoked,1);
  assert.equal((await call('/api/me','GET',undefined,'candidate')).status,200);
  assert.equal((await DB.prepare('SELECT COUNT(*) total FROM sessions WHERE user_id=?').bind('hr').first()).total,1);
});

test('вход и текущий пользователь сообщают фактическое окончание сессии',async t=>{
  const {call}=await fixture(t);
  const response=await call('/api/me','GET',undefined,'candidate');
  const {user}=await response.json();
  assert.ok(Date.parse(user.expires_at)>Date.now()+7*3600000);
  assert.equal('token_hash'in user,false);
});

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
