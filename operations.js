import {
  uid, now, safeText, must, requireRole, json, parseBody, hashPassword, validatedInteger
} from './security.js';
import {
  dbAll, dbOne, dbRun, statement, auditStatement, notificationStatement, applicationFor
} from './db.js';

export async function additionalOperations(request, env, user, pathname) {
  if (request.method !== 'POST') return null;
  const staffRoles = ['admin','hr'];

  if(pathname.startsWith('/api/vacancy-competencies/')){
    requireRole(user,staffRoles);
    const id=pathname.slice('/api/vacancy-competencies/'.length),body=await parseBody(request);
    const vacancy=await dbOne(env,'SELECT * FROM vacancies WHERE id=?',[id]);
    must(vacancy,'Вакансия не найдена.',404);
    must(vacancy.status==='draft','Профиль изменяется у черновика вакансии.');
    must(!await dbOne(env,'SELECT id FROM applications WHERE vacancy_id=?',[id]),'Для вакансии с откликами создайте отдельный черновик.',409);
    must(Number(body.version)===vacancy.version,'Вакансия уже изменена.',409);
    must(Array.isArray(body.items)&&body.items.length>=1&&body.items.length<=30,'Выберите от 1 до 30 компетенций.');
    const ids=new Set(),items=[];
    for(const item of body.items){
      const competency=safeText(item?.competency_id,100);
      must(!ids.has(competency),'Компетенция повторяется.');ids.add(competency);
      must(await dbOne(env,'SELECT id FROM competencies WHERE id=?',[competency]),'Компетенция не найдена.');
      items.push([id,competency,validatedInteger(item.target_level,1,5,'Целевой уровень')]);
    }
    await env.DB.batch([
      statement(env,'DELETE FROM vacancy_competencies WHERE vacancy_id=?',[id]),
      ...items.map(values=>statement(env,'INSERT INTO vacancy_competencies (vacancy_id,competency_id,target_level) VALUES (?,?,?)',values)),
      statement(env,'UPDATE vacancies SET version=version+1 WHERE id=?',[id]),
      auditStatement(env,user,'Изменение профиля компетенций','vacancy',id,String(items.length))
    ]);
    return json({ok:true});
  }

  if(pathname.startsWith('/api/clone-vacancy/')){
    requireRole(user,staffRoles);
    const source=await dbOne(env,'SELECT * FROM vacancies WHERE id=?',[pathname.slice('/api/clone-vacancy/'.length)]);
    must(source,'Вакансия не найдена.',404);
    const profile=await dbAll(env,'SELECT * FROM vacancy_competencies WHERE vacancy_id=?',[source.id]);
    const id=uid('vacancy');
    await env.DB.batch([
      statement(env,'INSERT INTO vacancies (id,department_id,title,description,requirements,schedule,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id,source.department_id,safeText('Копия: '+source.title,160),source.description,source.requirements,source.schedule,'draft',now()]),
      ...profile.map(row=>statement(env,'INSERT INTO vacancy_competencies (vacancy_id,competency_id,target_level) VALUES (?,?,?)',[id,row.competency_id,row.target_level])),
      auditStatement(env,user,'Копирование вакансии','vacancy',id,source.id)
    ]);
    return json({ok:true,id},201);
  }

  if(pathname==='/api/notices/read-all'){
    requireRole(user,['admin','hr','candidate']);
    const result=await dbRun(env,'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',[now(),user.id]);
    return json({ok:true,read:result.meta?.changes||0});
  }

  if (pathname.startsWith('/api/vacancy/')) {
    requireRole(user, staffRoles);
    const id = pathname.slice('/api/vacancy/'.length);
    const body = await parseBody(request);
    const vacancy = await dbOne(env, 'SELECT * FROM vacancies WHERE id=?', [id]);
    must(vacancy, 'Вакансия не найдена.', 404);
    must(Number(body.version) === vacancy.version, 'Вакансия уже изменена. Обновите список.', 409);
    const status = safeText(body.status,30);
    must(['draft','published','closed'].includes(status), 'Недопустимый статус вакансии.');
    const title=Object.hasOwn(body,'title')?safeText(body.title,160):vacancy.title;
    const description=Object.hasOwn(body,'description')?safeText(body.description,4000):vacancy.description;
    const requirements=Object.hasOwn(body,'requirements')?safeText(body.requirements,3000):vacancy.requirements;
    must(title.length >= 5 && description.length >= 20 && requirements.length >= 10,
      'Проверьте название, обязанности и требования.');
    const changed = await dbRun(env,
      'UPDATE vacancies SET title=?,description=?,requirements=?,status=?,version=version+1 WHERE id=? AND version=?',
      [title,description,requirements,status,id,vacancy.version]);
    must(changed.meta?.changes === 1,'Вакансия уже изменена.',409);
    await auditStatement(env,user,'Изменение вакансии','vacancy',id,`${vacancy.status} → ${status}`).run();
    return json({ok:true});
  }

  if (pathname === '/api/admin/publish-vacancies') {
    requireRole(user,['admin']);
    const body = await parseBody(request);
    must(Array.isArray(body.ids) && body.ids.length >= 1 && body.ids.length <= 30,
      'Выберите от 1 до 30 черновиков вакансий.');
    const ids = [...new Set(body.ids.map(id=>safeText(id,100)))];
    const statements = [];
    let changed = 0;
    for (const id of ids) {
      const vacancy = await dbOne(env,'SELECT * FROM vacancies WHERE id=?',[id]);
      must(vacancy,'Одна из вакансий не найдена.',404);
      if(vacancy.status !== 'draft') continue;
      statements.push(statement(env,"UPDATE vacancies SET status='published',version=version+1 WHERE id=? AND status='draft'",[id]));
      statements.push(auditStatement(env,user,'Массовая публикация','vacancy',id));
      changed += 1;
    }
    if(statements.length) await env.DB.batch(statements);
    return json({ok:true,published:changed});
  }

  if (pathname.startsWith('/api/interview/')) {
    requireRole(user,staffRoles);
    const id=pathname.slice('/api/interview/'.length);
    const row=await dbOne(env,'SELECT * FROM interviews WHERE id=?',[id]);
    must(row,'Собеседование не найдено.',404);
    must(row.status==='planned','Собеседование уже завершено или отменено.',409);
    const app=await applicationFor(env,row.application_id,user);
    const body=await parseBody(request);
    must(['completed','cancelled'].includes(body.status),'Недопустимый статус встречи.');
    const result=safeText(body.result,2500);
    must(result.length >= 10,'Укажите итог встречи или причину отмены.');
    const changed=await dbRun(env,"UPDATE interviews SET status=?,result=? WHERE id=? AND status='planned'",[body.status,result,id]);
    must(changed.meta?.changes===1,'Собеседование уже изменено.',409);
    await env.DB.batch([
      auditStatement(env,user,'Завершение встречи','interview',id,result),
      notificationStatement(env,app.candidate_id,
        body.status==='completed'?'Собеседование завершено':'Собеседование отменено',
        body.status==='completed'?'Кадровый специалист зафиксировал итог встречи.':result)
    ]);
    return json({ok:true});
  }

  if (pathname.startsWith('/api/withdraw/')) {
    requireRole(user,['candidate']);
    const id=pathname.slice('/api/withdraw/'.length);
    const app=await applicationFor(env,id,user);
    must(['new','review','interview','offer'].includes(app.status),
      'Отозвать завершённый отклик нельзя.');
    const changed=await dbRun(env,
      "UPDATE applications SET status='withdrawn',version=version+1,updated_at=? WHERE id=? AND version=?",
      [now(),id,app.version]);
    must(changed.meta?.changes===1,'Отклик уже изменён. Обновите страницу.',409);
    await env.DB.batch([
      statement(env,"UPDATE interviews SET status='cancelled',result='Отклик отозван соискателем.' WHERE application_id=? AND status='planned'",[id]),
      auditStatement(env,user,'Отзыв отклика','application',id),
      notificationStatement(env,user.id,'Отклик отозван',app.vacancy_title)
    ]);
    return json({ok:true});
  }

  if (pathname.startsWith('/api/read-notice/')) {
    requireRole(user,['admin','hr','candidate']);
    const id=pathname.slice('/api/read-notice/'.length);
    const result=await dbRun(env,
      'UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',
      [now(),id,user.id]);
    must(result.meta?.changes===1,'Уведомление не найдено.',404);
    return json({ok:true});
  }

  if (pathname === '/api/admin/create-user') {
    requireRole(user,['admin']);
    const body=await parseBody(request);
    const username=safeText(body.username,60).toLowerCase();
    const fullName=safeText(body.full_name,160);
    const role=safeText(body.role_id,30);
    const password=typeof body.password==='string'?body.password:'';
    must(/^[a-z][a-z0-9_-]{2,59}$/.test(username),
      'Логин: 3–60 латинских букв, цифр, дефисов или подчёркиваний.');
    must(fullName.length>=5,'Укажите имя учётной записи.');
    must(['hr','candidate'].includes(role),'Для новой записи доступны роли специалиста или соискателя.');
    must(password.length>=12&&password.length<=128,'Пароль должен содержать от 12 до 128 символов.');
    const exists=await dbOne(env,'SELECT id FROM users WHERE username=?',[username]);
    must(!exists,'Такой логин уже используется.',409);
    const id=uid('user');
    const salt=crypto.randomUUID();
    const passwordHash=await hashPassword(password,salt);
    const operations=[
      statement(env,'INSERT INTO users (id,username,full_name,password_hash,salt,role_id,active,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id,username,fullName,passwordHash,salt,role,1,now()]),
      auditStatement(env,user,'Создание записи','user',id,role)
    ];
    if(role==='candidate')operations.push(statement(env,
      'INSERT INTO profiles (user_id,education,experience,about,consent,updated_at) VALUES (?,?,?,?,?,?)',
      [id,'','','',0,now()]));
    await env.DB.batch(operations);
    return json({ok:true,id},201);
  }

  return null;
}
