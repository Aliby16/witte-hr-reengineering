import {
  uid, now, safeText, must, requireRole, json, parseBody, hashPassword, validatedInteger, validateDate
} from './security.js';
import {
  dbAll, dbOne, dbRun, statement, auditStatement, notificationStatement, applicationFor
} from './db.js';

export async function assertInterviewSlot(env,interviewer,candidate,scheduled,exclude=''){
  const rows=await dbAll(env,`SELECT i.id,i.scheduled_at FROM interviews i JOIN applications a ON a.id=i.application_id
    WHERE i.status='planned' AND (i.interviewer_id=? OR a.candidate_id=?)`,[interviewer,candidate]);
  must(!rows.some(row=>row.id!==exclude&&Math.abs(Date.parse(row.scheduled_at)-Date.parse(scheduled))<3600000),
    'В выбранный час у специалиста или соискателя уже запланировано собеседование.',409);
}

export async function additionalOperations(request, env, user, pathname) {
  if (request.method !== 'POST') return null;
  const staffRoles = ['admin','hr'];

  if(pathname.startsWith('/api/plan-edit/')){
    requireRole(user,staffRoles);const id=pathname.slice('/api/plan-edit/'.length),body=await parseBody(request);
    const plan=await dbOne(env,'SELECT * FROM adaptation_plans WHERE id=?',[id]);must(plan,'План не найден.',404);
    must(plan.status==='active','Завершённый план изменять нельзя.',409);
    const start=validateDate(body.start_date),end=validateDate(body.end_date),title=safeText(body.title,200),mentor=safeText(body.mentor_id,100);
    must(end>=start,'Окончание плана не может предшествовать началу.');must(title.length>=5,'Укажите название плана.');
    must(await dbOne(env,"SELECT id FROM users WHERE id=? AND active=1 AND role_id IN ('admin','hr')",[mentor]),'Наставником назначается активный кадровый специалист.');
    must(!await dbOne(env,'SELECT id FROM adaptation_tasks WHERE plan_id=? AND (due_date<? OR due_date>?)',[id,start,end]),'Сроки существующих заданий выходят за новый период плана.');
    await env.DB.batch([
      statement(env,"UPDATE adaptation_plans SET title=?,start_date=?,end_date=?,mentor_id=? WHERE id=? AND status='active'",[title,start,end,mentor,id]),
      auditStatement(env,user,'Изменение плана','plan',id,`${start} — ${end}; ${mentor}`),
      notificationStatement(env,plan.employee_id,'План адаптации уточнён',title)
    ]);
    return json({ok:true});
  }

  if(pathname.startsWith('/api/task-evidence/')){
    requireRole(user,staffRoles);const id=pathname.slice('/api/task-evidence/'.length),body=await parseBody(request);
    const task=await dbOne(env,'SELECT * FROM adaptation_tasks WHERE id=?',[id]);must(task,'Задание не найдено.',404);
    const plan=await dbOne(env,'SELECT status FROM adaptation_plans WHERE id=?',[task.plan_id]);
    must(task.status==='done'&&plan.status==='active','Подтверждение изменяется до завершения плана.',409);
    const evidence=safeText(body.evidence,2000);must(evidence.length>=10,'Опишите подтверждение не короче 10 символов.');
    must(body.expected_evidence===task.evidence,'Подтверждение уже изменено. Обновите план.',409);
    const changed=await dbRun(env,"UPDATE adaptation_tasks SET evidence=? WHERE id=? AND status='done' AND evidence=?",[evidence,id,task.evidence]);
    must(changed.meta?.changes===1,'Подтверждение уже изменено.',409);
    await auditStatement(env,user,'Исправление подтверждения','task',id,`${task.evidence} — ${evidence}`).run();
    return json({ok:true});
  }

  if(pathname.startsWith('/api/task-edit/')){
    requireRole(user,staffRoles);const id=pathname.slice('/api/task-edit/'.length),body=await parseBody(request);
    const task=await dbOne(env,'SELECT * FROM adaptation_tasks WHERE id=?',[id]);must(task,'Задание не найдено.',404);
    const plan=await dbOne(env,'SELECT * FROM adaptation_plans WHERE id=?',[task.plan_id]);
    must(task.status==='todo'&&plan.status==='active','Изменяется только невыполненное задание активного плана.',409);
    const title=safeText(body.title,250),due=validateDate(body.due_date);
    must(title.length>=5,'Укажите содержание задания не короче 5 символов.');
    must(due>=plan.start_date&&due<=plan.end_date,'Срок задания должен входить в период плана.');
    const changed=await dbRun(env,"UPDATE adaptation_tasks SET title=?,due_date=? WHERE id=? AND status='todo'",[title,due,id]);
    must(changed.meta?.changes===1,'Задание уже изменено.',409);
    await auditStatement(env,user,'Изменение задания','task',id,`${task.title} — ${title}; ${due}`).run();
    return json({ok:true});
  }

  if(pathname.startsWith('/api/application-letter/')){
    requireRole(user,['candidate']);const id=pathname.slice('/api/application-letter/'.length),body=await parseBody(request);
    const app=await applicationFor(env,id,user);must(app.status==='new','Сообщение изменяется до начала рассмотрения.',409);
    const letter=safeText(body.cover_letter,2000);must(letter.length>=10,'Сообщение должно содержать не менее 10 символов.');
    const version=validatedInteger(body.version,1,2147483647,'Версия');
    const changed=await dbRun(env,"UPDATE applications SET cover_letter=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='new'",[letter,now(),id,version]);
    must(changed.meta?.changes===1,'Отклик уже изменён. Обновите карточку.',409);
    await auditStatement(env,user,'Изменение сопроводительного сообщения','application',id).run();
    return json({ok:true,version:version+1});
  }

  if(pathname==='/api/admin/user-department'){
    requireRole(user,['admin']);const body=await parseBody(request),id=safeText(body.id,100);
    const target=await dbOne(env,'SELECT id FROM users WHERE id=?',[id]);must(target,'Пользователь не найден.',404);
    const department=safeText(body.department_id,100)||null;
    if(department)must(await dbOne(env,'SELECT id FROM departments WHERE id=?',[department]),'Подразделение не найдено.');
    await env.DB.batch([
      statement(env,'UPDATE users SET department_id=? WHERE id=?',[department,id]),
      auditStatement(env,user,'Назначение подразделения','user',id,department||'Без подразделения')
    ]);
    return json({ok:true});
  }

  if(pathname==='/api/admin/edit-department'){
    requireRole(user,['admin']);const body=await parseBody(request),id=safeText(body.id,100);
    const row=await dbOne(env,'SELECT * FROM departments WHERE id=?',[id]);must(row,'Подразделение не найдено.',404);
    const title=safeText(body.title,160),description=safeText(body.description,1000);
    must(title.length>=3,'Укажите название подразделения не короче 3 символов.');
    await env.DB.batch([
      statement(env,'UPDATE departments SET title=?,description=? WHERE id=?',[title,description,id]),
      auditStatement(env,user,'Изменение подразделения','department',id,`${row.title} — ${title}`)
    ]);
    return json({ok:true});
  }

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
    if(body.action==='reschedule'){
      must(['review','interview'].includes(app.status),'Отклик уже перешёл к итоговому решению.',409);
      const scheduled=validateDate(body.scheduled_at,true),format=safeText(body.format,250);
      must(Date.parse(scheduled)>Date.now(),'Выберите будущую дату собеседования.');
      must(format.length>=3,'Укажите формат и место встречи.');
      await assertInterviewSlot(env,row.interviewer_id,app.candidate_id,scheduled,id);
      const changed=await dbRun(env,"UPDATE interviews SET scheduled_at=?,format=? WHERE id=? AND status='planned' AND scheduled_at=?",[scheduled,format,id,row.scheduled_at]);
      must(changed.meta?.changes===1,'Встреча уже изменена. Обновите список.',409);
      await env.DB.batch([
        auditStatement(env,user,'Перенос собеседования','interview',id,`${row.scheduled_at} — ${scheduled}`),
        notificationStatement(env,app.candidate_id,'Собеседование перенесено',`${scheduled}. ${format}`)
      ]);
      return json({ok:true});
    }
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
