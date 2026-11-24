import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import worker from './worker.js';
import { NeonAdapter } from './neon-db.js';
import { LocalBucket } from './local-db.js';
import { DEMO_PASSWORD } from './seed.js';
import { PUBLIC_PAGES } from './public.js';

let connection=process.env.DATABASE_URL;
if(!connection){
  if(process.stdin.isTTY)process.stdin.setRawMode(true);
  console.log('Ready for private PostgreSQL configuration.');
  const input=createInterface({input:process.stdin,terminal:false});
  connection=await new Promise(resolve=>input.once('line',line=>resolve(JSON.parse(line).connection)));
  input.close();process.stdin.pause();
}
assert.ok(connection,'DATABASE_URL is required');
const DB=new NeonAdapter(connection);
const env={DB,BUCKET:new LocalBucket(new URL('./.sites-runtime/postgres-files',import.meta.url).pathname)};
const auth={},checks=[],requests=[];
const started=new Date().toISOString();
async function call(path,method='GET',body,role,withCsrf=true){
  const headers={origin:'http://localhost'};
  if(role){headers.cookie=auth[role].cookie;if(withCsrf)headers['x-csrf-token']=auth[role].csrf;}
  if(body&&!(body instanceof FormData))headers['content-type']='application/json';
  const time=performance.now();
  const response=await worker.fetch(new Request('http://localhost'+path,{method,headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),env);
  requests.push({path,method,status:response.status,milliseconds:Math.round((performance.now()-time)*100)/100});
  return response;
}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function status(path,method,body,role,expected=200){
  const response=await call(path,method,body,role);
  assert.equal(response.status,expected,path+': '+(response.status===expected?'':await response.text()));return response;
}
function pdf(){
  let content='%PDF-1.4\n',offsets=[0];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
  objects.forEach((object,i)=>{offsets.push(content.length);content+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=content.length;content+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  return content+`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
try{
  const version=await DB.prepare("SELECT current_setting('server_version') version").first();
  await check('PostgreSQL: двадцать таблиц и шесть индивидуальных солей',async()=>{
    const row=await DB.prepare("SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') tables,(SELECT COUNT(DISTINCT salt) FROM users) salts").first();
    assert.equal(row.tables,20);assert.equal(row.salts,6);
  });
  for(const role of ['admin','hr','candidate','candidate2','candidate3','candidate4'])await check('Вход '+role,async()=>{
    const response=await status('/api/login','POST',{username:role,password:DEMO_PASSWORD},undefined);
    const data=await response.json();auth[role]={cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.user.csrf_token};
  });
  await check('Десять публичных страниц',async()=>{
    assert.equal(Object.keys(PUBLIC_PAGES).length,10);
    for(const key of Object.keys(PUBLIC_PAGES))await status(key==='home'?'/':'/p/'+key,'GET');
  });
  await check('Ограничение административного реестра',async()=>{await status('/api/list/users','GET',undefined,'hr',403);await status('/api/list/users','GET',undefined,'admin');});
  await check('Изоляция откликов и планов',async()=>{await status('/api/applications/app-1','GET',undefined,'candidate2',403);await status('/api/plans/plan-1','GET',undefined,'candidate',403);await status('/api/plans/plan-1','GET',undefined,'candidate3');});
  await check('Изменение профиля требует CSRF',async()=>{assert.equal((await call('/api/profile','POST',{education:'Проверка'},'candidate',false)).status,403);});
  let vacancy,application,plan,versionNumber=1;
  await check('Копирование и публикация вакансии',async()=>{
    vacancy=(await(await status('/api/clone-vacancy/support-specialist','POST',{},'hr',201)).json()).id;
    const row=await DB.prepare('SELECT * FROM vacancies WHERE id=?').bind(vacancy).first();
    await status('/api/vacancy/'+vacancy,'POST',{version:row.version,status:'published',title:row.title,description:row.description,requirements:row.requirements},'hr');
  });
  await check('Отправка и запрет повторного отклика',async()=>{
    const body={vacancy_id:vacancy,cover_letter:'Проверка сквозного процесса работы с кандидатом.'};
    application=(await(await status('/api/applications','POST',body,'candidate4',201)).json()).id;
    await status('/api/applications','POST',body,'candidate4',409);
  });
  await check('Переходы рассмотрения и конфликт версии',async()=>{
    for(const state of ['review','interview']){const data=await(await status('/api/applications/'+application,'POST',{version:versionNumber,status:state},'hr')).json();versionNumber=data.version;}
    await status('/api/applications/'+application,'POST',{version:1,status:'rejected',decision_note:'Проверка устаревшей карточки.'},'hr',409);
  });
  await check('Решение заблокировано до оценки компетенций',async()=>{await status('/api/applications/'+application,'POST',{version:versionNumber,status:'offer',decision_note:'Результат проверки компетенций.'},'hr',400);});
  await check('Назначение и перенос встречи',async()=>{
    const {rows}=await(await status('/api/list/interviews','GET',undefined,'hr')).json();
    const base=Math.max(Date.now()+86400000,...rows.filter(r=>r.status==='planned').map(r=>Date.parse(r.scheduled_at)))+7200000;
    const meeting=(await(await status('/api/interviews','POST',{application_id:application,scheduled_at:new Date(base).toISOString(),format:'Проверочная видеовстреча'},'hr',201)).json()).id;
    await status('/api/interview/'+meeting,'POST',{action:'reschedule',scheduled_at:new Date(base+7200000).toISOString(),format:'Уточнённая видеовстреча'},'hr');
  });
  await check('Оценки сохраняются в PostgreSQL',async()=>{
    const {assessments}=await(await status('/api/applications/'+application,'GET',undefined,'hr')).json();
    for(const competency of assessments)await status('/api/assessments','POST',{application_id:application,competency_id:competency.id,score:4,evidence:'Контрольное ситуационное задание выполнено с объяснением порядка действий.'},'hr');
  });
  await check('Приём и отмена оставшейся встречи',async()=>{
    for(const state of ['offer','hired']){const data=await(await status('/api/applications/'+application,'POST',{version:versionNumber,status:state,decision_note:'Решение принято по результатам заполненного оценочного листа.'},'hr')).json();versionNumber=data.version;}
    const row=await DB.prepare("SELECT COUNT(*) total FROM interviews WHERE application_id=? AND status='planned'").bind(application).first();assert.equal(row.total,0);
  });
  await check('План адаптации и проверка границ срока',async()=>{
    const start=new Date().toISOString().slice(0,10),end=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    plan=(await(await status('/api/plans','POST',{application_id:application,title:'Проверка адаптации нового сотрудника',start_date:start,end_date:end},'hr',201)).json()).id;
    await status('/api/plans/'+plan,'POST',{title:'Подтвердить ознакомление с регламентом',due_date:'2000-01-01'},'hr',400);
    await status('/api/plans/'+plan,'POST',{title:'Подтвердить ознакомление с регламентом',due_date:end},'hr');
  });
  await check('Незавершённый план и подтверждение задания',async()=>{
    await status('/api/plans/'+plan,'POST',{action:'complete'},'hr',400);
    const {tasks}=await(await status('/api/plans/'+plan,'GET',undefined,'hr')).json();
    await status('/api/tasks/'+tasks[0].id,'POST',{evidence:'Ознакомление с регламентом подтверждено выполненным заданием.'},'hr');
    await status('/api/plans/'+plan,'POST',{action:'complete'},'hr');
    await status('/api/plans/'+plan,'POST',{action:'complete'},'hr',409);
  });
  await check('Экспорты XLSX и DOCX из PostgreSQL',async()=>{
    for(const path of ['/api/export/applications.xlsx','/api/export/plan/'+plan]){const response=await status(path,'GET',undefined,'hr');const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(bytes[0],80);assert.equal(bytes[1],75);}
  });
  await check('PDF: загрузка, переименование и владелец',async()=>{
    const form=new FormData();form.set('file',new File([pdf()],'postgres-check.pdf',{type:'application/pdf'}));
    const {id}=await(await status('/api/files','POST',form,'candidate4',201)).json();
    await status('/api/file-rename/'+id,'POST',{name:'Проверка PostgreSQL'},'candidate4');
    await status('/api/files/'+id,'GET',undefined,'candidate',403);
    await status('/api/files/'+id,'GET',undefined,'candidate4');
  });
  await check('Форма обратной связи сохраняет номер',async()=>{
    const data=await(await status('/api/feedback','POST',{name:'Проверка сервиса',contact:'qa@example.invalid',topic:'Интеграционная проверка',message:'Проверка регистрации обращения '+Date.now(),consent:true},undefined,201)).json();assert.ok(data.id);
  });
  const measurements=[];
  await check('Обзор: десять последовательных замеров, среднее менее двух секунд',async()=>{
    for(let i=0;i<10;i++){const t=performance.now();await status('/api/dashboard','GET',undefined,'hr');measurements.push(Math.round((performance.now()-t)*100)/100);}
    assert.ok(measurements.reduce((a,b)=>a+b,0)/measurements.length<2000);
  });
  const result={started,finished:new Date().toISOString(),environment:'Node.js '+process.versions.node,postgresql:version.version,checks:checks.length,passed:checks,requests,measurements,mean_ms:measurements.reduce((a,b)=>a+b,0)/measurements.length};
  mkdirSync(new URL('./.sites-runtime/',import.meta.url),{recursive:true});
  writeFileSync(new URL('./.sites-runtime/postgres-results.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify({checks:checks.length,requests:requests.length,mean_ms:Math.round(result.mean_ms),postgresql:version.version}));
}catch(error){console.error(error.name,String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exitCode=1;}
