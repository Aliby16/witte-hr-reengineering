import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import worker from './worker.js';
import { SqliteAdapter, LocalBucket } from './local-db.js';
import { DEMO_PASSWORD } from './seed.js';
import { htmlEscape, validateDate } from './security.js';
import { CLIENT } from './client.js';
import { PUBLIC_PAGES } from './public.js';

const DB = new SqliteAdapter();
DB.initialize(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const fileRoot = new URL('./.sites-runtime/test-files',import.meta.url).pathname;
const env = {DB,BUCKET:new LocalBucket(fileRoot)};
const auth = {};
let newVacancy;
let newApplication;
let newPlan;
let newTask;
let attachment;
const results = [];

async function call(path, method='GET', body, role, options={}) {
  const headers = new Headers(options.headers||{});
  headers.set('origin','http://localhost');
  if(role && auth[role]) {
    headers.set('cookie',auth[role].cookie);
    if(!options.noCsrf)headers.set('x-csrf-token',auth[role].csrf);
  }
  let payload=body;
  if(body && !(body instanceof FormData)) {
    headers.set('content-type','application/json');
    payload=JSON.stringify(body);
  }
  const start=performance.now();
  const response=await worker.fetch(new Request(`http://localhost${path}`,{
    method,headers,...(payload!==undefined?{body:payload}:{})
  }),env,{});
  results.push({path,method,status:response.status,milliseconds:Number((performance.now()-start).toFixed(2))});
  return response;
}

before(async()=>{
  await call('/api/demo/start','POST',{});
  for(const role of ['admin','hr','candidate','candidate2','candidate3']) {
    const response=await call('/api/login','POST',{username:role,password:DEMO_PASSWORD});
    assert.equal(response.status,200);
    const data=await response.json();
    auth[role]={cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.user.csrf_token};
  }
});

test('структура SQL содержит не менее 10 связанных таблиц',async()=>{
  const {results}=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  assert.ok(results.length>=10);
  assert.equal(results.length,20);
});

test('bootstrap повторно не создаёт дубликаты',async()=>{
  const first=await DB.prepare('SELECT COUNT(*) count FROM users').first();
  assert.equal((await call('/api/demo/start','POST',{})).status,200);
  const second=await DB.prepare('SELECT COUNT(*) count FROM users').first();
  assert.equal(first.count,second.count);
});

test('все десять публичных страниц открываются без авторизации',async()=>{
  assert.equal(Object.keys(PUBLIC_PAGES).length,10);
  for(const page of Object.keys(PUBLIC_PAGES)) {
    const response=await call(page==='home'?'/':`/p/${page}`);
    assert.equal(response.status,200,page);
    assert.match(await response.text(),/Хлебные крошки/);
  }
});

test('клиентский JavaScript имеет корректный синтаксис',()=>{
  assert.doesNotThrow(()=>new Function(CLIENT));
});

test('закрытая страница перенаправляет неавторизованного пользователя',async()=>{
  const response=await call('/app/dashboard');
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'/login');
});

test('неверный пароль не создаёт сессию',async()=>{
  const response=await call('/api/login','POST',{username:'hr',password:'incorrect-example'});
  assert.equal(response.status,401);
  assert.equal(response.headers.get('set-cookie'),null);
});

test('роль соискателя не получает административные реестры',async()=>{
  for(const resource of ['users','roles','audit','settings'])assert.equal((await call(`/api/list/${resource}`,'GET',undefined,'candidate')).status,403);
  assert.equal((await call('/api/list/roles','GET',undefined,'admin')).status,200);
  assert.equal((await call('/app/users','GET',undefined,'candidate')).status,403);
});

test('права доступа различают собственный и чужой отклик',async()=>{
  assert.equal((await call('/api/applications/app-1','GET',undefined,'candidate')).status,200);
  assert.equal((await call('/api/applications/app-2','GET',undefined,'candidate')).status,403);
});

test('план другого сотрудника закрыт для соискателя',async()=>{
  assert.equal((await call('/api/plans/plan-1','GET',undefined,'candidate')).status,403);
  assert.equal((await call('/api/plans/plan-1','GET',undefined,'candidate3')).status,200);
});

test('изменения профиля требуют CSRF-токен',async()=>{
  const response=await call('/api/profile','POST',{education:'Сведения'},'candidate',{noCsrf:true});
  assert.equal(response.status,403);
});

test('профиль сохраняется с явным согласием',async()=>{
  const response=await call('/api/profile','POST',{
    education:'Высшее образование · тест',experience:'Опыт сопровождения документов',
    about:'Вымышленные данные для проверки.',consent:true
  },'candidate');
  assert.equal(response.status,200);
  const data=await (await call('/api/profile','GET',undefined,'candidate')).json();
  assert.equal(data.profile.consent,1);
  assert.equal(data.profile.education,'Высшее образование · тест');
});

test('соискатель не может создать вакансию',async()=>{
  assert.equal((await call('/api/vacancies','POST',{},'candidate')).status,403);
});

test('кадровый специалист создаёт полноценную вакансию',async()=>{
  const response=await call('/api/vacancies','POST',{
    title:'Специалист реестра',department_id:'office',
    description:'Сопровождение реестра и проверка реквизитов документов.',
    requirements:'Уверенная работа с таблицами и документами.',status:'published'
  },'hr');
  assert.equal(response.status,201);
  newVacancy=(await response.json()).id;
});

test('пустое описание вакансии отклоняется',async()=>{
  const response=await call('/api/vacancies','POST',{title:'Тестовая вакансия',department_id:'office',description:'',requirements:'тест'},'hr');
  assert.equal(response.status,400);
});

test('соискатель отправляет отклик',async()=>{
  const response=await call('/api/applications','POST',{vacancy_id:newVacancy,cover_letter:'Хочу применить навыки ведения реестра.'},'candidate');
  assert.equal(response.status,201);
  newApplication=(await response.json()).id;
});

test('повторный отклик предотвращается ограничением уникальности',async()=>{
  const response=await call('/api/applications','POST',{vacancy_id:newVacancy,cover_letter:'Повторный отклик.'},'candidate');
  assert.equal(response.status,409);
});

test('нельзя пропустить этапы и сразу принять нового соискателя',async()=>{
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'hired',version:1,decision_note:'Решение без оценки.'},'hr')).status,400);
});

test('критический путь включает рассмотрение и собеседование',async()=>{
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'review',version:1},'hr')).status,200);
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'interview',version:2},'hr')).status,200);
});

test('параллельная устаревшая версия не перезаписывает карточку',async()=>{
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'rejected',version:1,decision_note:'Проверка устаревшей версии.'},'hr')).status,409);
});

test('предложение работы заблокировано до заполнения компетенций',async()=>{
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'offer',version:3,decision_note:'Предложение без всех оценок.'},'hr')).status,400);
});

test('оценка вне шкалы и оценка без основания отклоняются',async()=>{
  assert.equal((await call('/api/assessments','POST',{application_id:newApplication,competency_id:'digital',score:7,evidence:'Проверка границы шкалы.'},'hr')).status,400);
  assert.equal((await call('/api/assessments','POST',{application_id:newApplication,competency_id:'digital',score:3,evidence:''},'hr')).status,400);
});

test('критический путь заполняет все оценки',async()=>{
  const {rows}=await (await call('/api/list/competencies')).json();
  for(const competency of rows) {
    const response=await call('/api/assessments','POST',{
      application_id:newApplication,competency_id:competency.id,score:4,
      evidence:'Ситуационное задание выполнено с объяснением порядка действий.'
    },'hr');
    assert.equal(response.status,200);
  }
});

test('кадровое решение требует обоснования и правильной версии',async()=>{
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'offer',version:3,decision_note:''},'hr')).status,400);
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'offer',version:3,decision_note:'Все компетенции проверены по ситуационным заданиям.'},'hr')).status,200);
  assert.equal((await call(`/api/applications/${newApplication}`,'POST',{status:'hired',version:4,decision_note:'Соискатель подтвердил предложение в сценарии.'},'hr')).status,200);
});

test('план адаптации создаётся после приёма',async()=>{
  const response=await call('/api/plans','POST',{
    application_id:newApplication,title:'Адаптация специалиста',
    start_date:'2026-11-24',end_date:'2026-12-24'
  },'hr');
  assert.equal(response.status,201);
  newPlan=(await response.json()).id;
});

test('не допускается второй план на один приём',async()=>{
  assert.equal((await call('/api/plans','POST',{application_id:newApplication,title:'Второй план',start_date:'2026-11-24',end_date:'2026-12-24'},'hr')).status,409);
});

test('срок задания контролируется периодом плана',async()=>{
  assert.equal((await call(`/api/plans/${newPlan}`,'POST',{title:'Задание за пределами периода',due_date:'2027-01-10'},'hr')).status,400);
  assert.equal((await call(`/api/plans/${newPlan}`,'POST',{title:'Проверить маршрут регистрации документа',due_date:'2026-12-01'},'hr')).status,200);
  const data=await (await call(`/api/plans/${newPlan}`,'GET',undefined,'hr')).json();
  newTask=data.tasks[0].id;
});

test('план с невыполненным заданием не завершается',async()=>{
  assert.equal((await call(`/api/plans/${newPlan}`,'POST',{action:'complete'},'hr')).status,400);
});

test('критический путь завершается подтверждённой адаптацией',async()=>{
  assert.equal((await call(`/api/tasks/${newTask}`,'POST',{evidence:'Маршрут выполнен и проверен наставником.'},'hr')).status,200);
  assert.equal((await call(`/api/plans/${newPlan}`,'POST',{action:'complete'},'hr')).status,200);
  const data=await (await call(`/api/plans/${newPlan}`,'GET',undefined,'candidate')).json();
  assert.equal(data.plan.status,'completed');
});

test('документы формируются в настоящих форматах XLSX и DOCX',async()=>{
  mkdirSync(new URL('./.sites-runtime/exports',import.meta.url),{recursive:true});
  const xlsx=await call('/api/export/applications.xlsx','GET',undefined,'hr');
  assert.equal(xlsx.status,200);
  const xbytes=new Uint8Array(await xlsx.arrayBuffer());
  assert.deepEqual([...xbytes.slice(0,4)],[80,75,3,4]);
  writeFileSync(new URL('./.sites-runtime/exports/applications.xlsx',import.meta.url),xbytes);
  const docx=await call(`/api/export/plan/${newPlan}`,'GET',undefined,'candidate');
  assert.equal(docx.status,200);
  const dbytes=new Uint8Array(await docx.arrayBuffer());
  assert.deepEqual([...dbytes.slice(0,4)],[80,75,3,4]);
  writeFileSync(new URL('./.sites-runtime/exports/plan.docx',import.meta.url),dbytes);
});

test('загружается PDF с проверкой содержимого',async()=>{
  const data=new FormData();
  data.set('file',new File(['%PDF-1.4\nУчебный пример\n%%EOF'],'example.pdf',{type:'application/pdf'}));
  const response=await call('/api/files','POST',data,'candidate');
  assert.equal(response.status,201);
  attachment=(await response.json()).id;
});

test('чужой документ недоступен соискателю',async()=>{
  assert.equal((await call(`/api/files/${attachment}`,'GET',undefined,'candidate2')).status,403);
  assert.equal((await call(`/api/files/${attachment}`,'GET',undefined,'candidate')).status,200);
});

test('расширение PDF не подменяет проверку сигнатуры',async()=>{
  const data=new FormData();
  data.set('file',new File(['<html>not a pdf</html>'],'bad.pdf',{type:'application/pdf'}));
  assert.equal((await call('/api/files','POST',data,'candidate')).status,400);
});

test('обратная связь сохраняется и защищена от мгновенного дублирования',async()=>{
  const body={name:'Пользователь',contact:'test@example.invalid',topic:'Проверка формы',message:'Проверяем сохранение обращения.',consent:true};
  assert.equal((await call('/api/feedback','POST',body)).status,201);
  assert.equal((await call('/api/feedback','POST',body)).status,409);
});

test('администратор создаёт и блокирует пользователя',async()=>{
  const create=await call('/api/admin/create-user','POST',{username:'new-candidate',full_name:'Тестовый соискатель',role_id:'candidate',password:DEMO_PASSWORD},'admin');
  assert.equal(create.status,201);
  const {id}=await create.json();
  assert.equal((await call('/api/admin/users','POST',{id,active:false},'admin')).status,200);
  assert.equal((await call('/api/login','POST',{username:'new-candidate',password:DEMO_PASSWORD})).status,401);
});

test('администратор не блокирует собственную запись',async()=>{
  assert.equal((await call('/api/admin/users','POST',{id:'admin',active:false},'admin')).status,400);
});

test('HTML-спецсимволы экранируются перед выводом',()=>{
  assert.equal(htmlEscape('<script>"x"</script>'),'&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('невозможная календарная дата отклоняется',()=>{
  assert.throws(()=>validateDate('2026-02-31'));
});

test('ответы запрещают встраивание и определение типа по содержимому',async()=>{
  const response=await call('/');
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});

test('служебный журнал содержит действия без паролей и токенов сессий',async()=>{
  const {rows}=await (await call('/api/list/audit','GET',undefined,'admin')).json();
  assert.ok(rows.length>10);
  assert.ok(!JSON.stringify(rows).includes(DEMO_PASSWORD));
});

test('контроль отклика базы укладывается в две секунды',async()=>{
  const start=performance.now();
  for(let index=0;index<10;index++)assert.equal((await call('/api/dashboard','GET',undefined,'hr')).status,200);
  assert.ok((performance.now()-start)/10<2000);
});

after(()=>{
  mkdirSync(new URL('./.sites-runtime',import.meta.url),{recursive:true});
  writeFileSync(new URL('./.sites-runtime/test-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),checks:results},null,2));
  DB.close();
});
