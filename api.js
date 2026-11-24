import {
  uid, now, safeText, must, AppError, requireRole, json, parseBody,
  hashPassword, equalHash, digest, validateDate, validatedInteger, requireSameOrigin
} from './security.js';
import {
  dbAll, dbOne, dbRun, statement, auditStatement, notificationStatement,
  readSession, publicUser, applicationFor, planFor, updateApplication
} from './db.js';
import { seedDemo } from './seed.js';
import { exportXlsx, exportDocx } from './documents.js';
import { additionalOperations, assertInterviewSlot } from './operations.js';

const STAFF = ['admin', 'hr'];

export function allowedApiMethods(path){
  if(['/api/me','/api/health','/api/dashboard','/api/sessions'].includes(path)||/^\/api\/(list|export)\//.test(path))return ['GET','HEAD'];
  if(path==='/api/profile'||/^\/api\/(applications|plans)\/[^/]+$/.test(path))return ['GET','HEAD','POST'];
  if(/^\/api\/files\/[^/]+$/.test(path))return ['GET','HEAD'];
  if(['/api/demo/start','/api/login','/api/logout','/api/sessions/revoke-others','/api/notices/read-all','/api/applications','/api/vacancies','/api/assessments','/api/interviews','/api/plans','/api/files','/api/requests','/api/feedback'].includes(path)||
    /^\/api\/(vacancy|vacancy-competencies|clone-vacancy|application-letter|interview|withdraw|read-notice|tasks|task-edit|task-evidence|plan-edit|file-rename|requests|admin)\//.test(path))return ['POST'];
  return null;
}

async function login(request, env) {
  requireSameOrigin(request);
  const body = await parseBody(request);
  const username = safeText(body.username, 80).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  must(username && password && password.length <= 128, 'Введите логин и пароль.');
  const initialized = await dbOne(env, 'SELECT value FROM settings WHERE key=?', ['demo_initialized']);
  must(initialized, 'Сначала создайте набор кнопкой на странице входа.', 409);
  const key = await digest(`${request.headers.get('cf-connecting-ip') || 'local'}:${username}`);
  const attempt = await dbOne(env, 'SELECT * FROM login_attempts WHERE attempt_key=?', [key]);
  const recent = attempt && Date.now() - Date.parse(attempt.last_at) < 15 * 60 * 1000;
  must(!recent || attempt.failures < 8, 'Слишком много попыток. Повторите через 15 минут.', 429);
  const user = await dbOne(env, 'SELECT * FROM users WHERE username=? AND active=1', [username]);
  const calculated = await hashPassword(password, user?.salt || 'not-an-account');
  if (!user || !equalHash(calculated, user.password_hash)) {
    await dbRun(env,
      `INSERT INTO login_attempts (attempt_key,failures,last_at) VALUES (?,?,?)
       ON CONFLICT(attempt_key) DO UPDATE SET failures=?,last_at=?`,
      [key, 1, now(), recent ? attempt.failures + 1 : 1, now()]);
    throw new AppError(401, 'Неверный логин или пароль.');
  }
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const csrf = crypto.randomUUID();
  const tokenHash = await digest(token);
  const expiresAt=new Date(Date.now()+8*3600000).toISOString();
  await env.DB.batch([
    statement(env, 'DELETE FROM login_attempts WHERE attempt_key=?', [key]),
    statement(env, 'DELETE FROM sessions WHERE expires_at<?', [now()]),
    statement(env, 'INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)',
      [tokenHash, user.id, csrf, expiresAt]),
    statement(env,`DELETE FROM sessions WHERE user_id=? AND token_hash<>? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE user_id=? AND token_hash<>? ORDER BY expires_at DESC,token_hash DESC LIMIT 4)`,
      [user.id,tokenHash,user.id,tokenHash]),
    auditStatement(env, user, 'Вход', 'session', user.id)
  ]);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({ user: publicUser({ ...user, csrf_token: csrf, expires_at:expiresAt }) }, 200,
    { 'Set-Cookie': `witte_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}` });
}

async function listApplications(env, user) {
  requireRole(user, ['admin','hr','candidate']);
  const where = user.role_id === 'candidate' ? ' WHERE a.candidate_id=?' : '';
  const values = user.role_id === 'candidate' ? [user.id] : [];
  return dbAll(env,
    `SELECT a.*,v.title vacancy_title,u.full_name candidate_name,d.title department_title,
     (SELECT COUNT(*) FROM assessments s WHERE s.application_id=a.id) assessment_count
     FROM applications a JOIN vacancies v ON v.id=a.vacancy_id
     JOIN users u ON u.id=a.candidate_id JOIN departments d ON d.id=v.department_id
     ${where} ORDER BY a.created_at DESC LIMIT 200`, values);
}

async function listPlans(env, user) {
  requireRole(user, ['admin','hr','candidate']);
  const where = user.role_id === 'candidate' ? 'WHERE p.employee_id=?' : '';
  const values = user.role_id === 'candidate' ? [user.id] : [];
  return dbAll(env,
    `SELECT p.*,u.full_name employee_name,m.full_name mentor_name,
     (SELECT COUNT(*) FROM adaptation_tasks t WHERE t.plan_id=p.id) task_count,
     (SELECT COUNT(*) FROM adaptation_tasks t WHERE t.plan_id=p.id AND t.status='done') done_count,
     (SELECT COUNT(*) FROM adaptation_tasks t WHERE t.plan_id=p.id AND t.status='todo' AND t.due_date< ?) overdue_count
     FROM adaptation_plans p JOIN users u ON u.id=p.employee_id JOIN users m ON m.id=p.mentor_id
     ${where} ORDER BY p.start_date DESC LIMIT 200`, [now().slice(0,10),...values]);
}

async function dashboard(env, user) {
  requireRole(user, ['admin','hr','candidate']);
  const apps = await listApplications(env, user);
  const plans = await listPlans(env, user);
  const statusCounts = {};
  for (const app of apps) statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  const tasks = await dbAll(env,
    `SELECT t.*,p.employee_id,p.title plan_title,u.full_name employee_name FROM adaptation_tasks t JOIN adaptation_plans p ON p.id=t.plan_id JOIN users u ON u.id=p.employee_id
     ${user.role_id === 'candidate' ? 'WHERE p.employee_id=?' : ''}`, user.role_id === 'candidate' ? [user.id] : []);
  const vacancies = await dbOne(env, "SELECT COUNT(*) total FROM vacancies WHERE status='published'");
  return {
    applications: apps.length,
    vacancies: vacancies.total,
    plans: plans.length,
    overdue: tasks.filter(t => t.status !== 'done' && t.due_date < today).length,
    overdue_tasks:tasks.filter(t=>t.status!=='done'&&t.due_date<today).sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,20),
    completed_tasks: tasks.filter(t => t.status === 'done').length,
    all_tasks: tasks.length,
    statuses: statusCounts,
    recent: apps.slice(0, 5),
    demo: true
  };
}

async function createApplication(request, env, user) {
  requireRole(user, ['candidate']);
  const body = await parseBody(request);
  const vacancy = await dbOne(env, "SELECT * FROM vacancies WHERE id=? AND status='published'", [safeText(body.vacancy_id, 100)]);
  must(vacancy, 'Вакансия закрыта или не найдена.', 404);
  const profile = await dbOne(env, 'SELECT * FROM profiles WHERE user_id=?', [user.id]);
  must(profile?.consent === 1, 'Подтвердите согласие в профиле перед отправкой отклика.');
  must(profile.education.length >= 3, 'Укажите сведения об образовании в профиле.');
  const existing = await dbOne(env, 'SELECT id FROM applications WHERE vacancy_id=? AND candidate_id=?', [vacancy.id, user.id]);
  must(!existing, 'Отклик на эту вакансию уже существует.', 409);
  const letter = safeText(body.cover_letter, 2000);
  must(letter.length >= 10, 'Сопроводительное сообщение должно содержать не менее 10 символов.');
  const id = uid('app');
  await env.DB.batch([
    statement(env, 'INSERT INTO applications (id,vacancy_id,candidate_id,cover_letter,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, vacancy.id, user.id, letter, 'new', now(), now()]),
    auditStatement(env, user, 'Создание отклика', 'application', id),
    notificationStatement(env, user.id, 'Отклик зарегистрирован', `Вакансия: ${vacancy.title}. Статус доступен в личном кабинете.`)
  ]);
  return json({ ok: true, id }, 201);
}

async function createVacancy(request, env, user) {
  requireRole(user, STAFF);
  const body = await parseBody(request);
  const title = safeText(body.title, 160);
  const description = safeText(body.description, 4000);
  const requirements = safeText(body.requirements, 3000);
  const department = safeText(body.department_id, 100);
  must(title.length >= 5 && description.length >= 20 && requirements.length >= 10, 'Заполните название, описание и требования к вакансии.');
  must(await dbOne(env, 'SELECT id FROM departments WHERE id=?', [department]), 'Подразделение не найдено.');
  const status=body.status===undefined?'draft':safeText(body.status,30);
  must(['draft','published'].includes(status),'При создании доступны черновик и публикация.');
  let requestId = safeText(body.request_id,100) || null;
  if (requestId) {
    const approved = await dbOne(env, "SELECT * FROM requests WHERE id=? AND status='approved'", [requestId]);
    must(approved && approved.department_id === department, 'Нужна согласованная заявка выбранного подразделения.');
  }
  const id = uid('vacancy');
  const competencyRows = await dbAll(env, 'SELECT id FROM competencies');
  must(competencyRows.length, 'Сначала заполните справочник компетенций.');
  await env.DB.batch([
    statement(env, 'INSERT INTO vacancies (id,request_id,department_id,title,description,requirements,schedule,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, requestId, department, title, description, requirements, safeText(body.schedule, 200) || 'Полная занятость', status, now()]),
    ...competencyRows.map(row => statement(env, 'INSERT INTO vacancy_competencies (vacancy_id,competency_id,target_level) VALUES (?,?,?)', [id, row.id, 3])),
    auditStatement(env, user, 'Создание вакансии', 'vacancy', id, title)
  ]);
  return json({ ok: true, id }, 201);
}

async function createAssessment(request, env, user) {
  requireRole(user, STAFF);
  const body = await parseBody(request);
  const app = await applicationFor(env, safeText(body.application_id, 100), user);
  must(!['hired','rejected','withdrawn'].includes(app.status), 'Оценка завершённого отклика заблокирована.');
  const competency = safeText(body.competency_id, 100);
  must(await dbOne(env, 'SELECT competency_id FROM vacancy_competencies WHERE vacancy_id=? AND competency_id=?', [app.vacancy_id, competency]),
    'Эта компетенция не входит в профиль вакансии.');
  const score = validatedInteger(body.score, 0, 5, 'Оценка');
  const evidence = safeText(body.evidence, 2000);
  must(evidence.length >= 10, 'Опишите наблюдаемый результат задания: не менее 10 символов.');
  const existing=await dbOne(env,'SELECT created_at FROM assessments WHERE application_id=? AND competency_id=?',[app.id,competency]);
  must(!existing||body.expected_at===existing.created_at,'Оценка уже изменена. Обновите карточку.',409);
  const timestamp=new Date(Math.max(Date.now(),Date.parse(existing?.created_at||'')+1||0)).toISOString();
  const changed=await dbRun(env,
      `INSERT INTO assessments (id,application_id,competency_id,assessor_id,score,evidence,created_at)
       VALUES (?,?,?,?,?,?,?) ON CONFLICT(application_id,competency_id)
       DO UPDATE SET score=excluded.score,evidence=excluded.evidence,assessor_id=excluded.assessor_id,created_at=excluded.created_at
       WHERE assessments.created_at=?`,
      [uid('score'), app.id, competency, user.id, score, evidence, timestamp,body.expected_at||'']);
  must(changed.meta?.changes===1,'Оценка уже изменена. Обновите карточку.',409);
  await auditStatement(env,user,'Оценка компетенции','application',app.id,`${competency}: ${score}`).run();
  return json({ ok: true });
}

async function createInterview(request, env, user) {
  requireRole(user, STAFF);
  const body = await parseBody(request);
  const app = await applicationFor(env, safeText(body.application_id, 100), user);
  must(['review','interview'].includes(app.status), 'Собеседование назначается после первичного рассмотрения отклика.');
  const scheduled = validateDate(body.scheduled_at, true);
  must(Date.parse(scheduled) > Date.now(), 'Выберите будущую дату собеседования.');
  const format = safeText(body.format, 250);
  must(format.length >= 3, 'Укажите формат и место встречи.');
  await assertInterviewSlot(env,user.id,app.candidate_id,scheduled);
  const id = uid('interview');
  await env.DB.batch([
    statement(env, 'INSERT INTO interviews (id,application_id,interviewer_id,scheduled_at,format,created_at) VALUES (?,?,?,?,?,?)',
      [id, app.id, user.id, scheduled, format, now()]),
    notificationStatement(env, app.candidate_id, 'Назначено собеседование', `Дата: ${scheduled.replace('T',' ')}. ${format}`),
    auditStatement(env, user, 'Назначение собеседования', 'interview', id, scheduled)
  ]);
  return json({ ok: true, id }, 201);
}

async function createPlan(request, env, user) {
  requireRole(user, STAFF);
  const body = await parseBody(request);
  const app = await applicationFor(env, safeText(body.application_id, 100), user);
  must(app.status === 'hired', 'План адаптации создаётся после решения о приёме.');
  must(!await dbOne(env, 'SELECT id FROM adaptation_plans WHERE application_id=?', [app.id]), 'Для этого приёма уже есть план адаптации.', 409);
  const start = validateDate(body.start_date);
  const end = validateDate(body.end_date);
  must(end >= start, 'Окончание плана не может предшествовать началу.');
  const title = safeText(body.title, 200);
  must(title.length >= 5, 'Укажите название плана.');
  const id = uid('plan');
  await env.DB.batch([
    statement(env, 'INSERT INTO adaptation_plans (id,application_id,employee_id,mentor_id,title,start_date,end_date,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, app.id, app.candidate_id, user.id, title, start, end, now()]),
    notificationStatement(env, app.candidate_id, 'Создан план адаптации', title),
    auditStatement(env, user, 'Создание плана адаптации', 'plan', id)
  ]);
  return json({ ok: true, id }, 201);
}

async function uploadFile(request, env, user) {
  requireRole(user, ['admin','hr','candidate']);
  must(env.BUCKET, 'Хранилище файлов не подключено.', 503);
  const length = Number(request.headers.get('content-length') || 0);
  must(length <= 2200000, 'Размер файла превышает 2 МБ.', 413);
  const data = await request.formData();
  const file = data.get('file');
  const replaceId=safeText(data.get('replace_id'),100);
  const existing=replaceId?await dbOne(env,'SELECT * FROM file_documents WHERE id=?',[replaceId]):null;
  if(replaceId){must(existing,'Документ не найден.',404);must(existing.owner_id===user.id,'Обновлять можно только собственные документы.',403);}
  must(file && typeof file.arrayBuffer === 'function', 'Выберите PDF-файл.');
  must(file.size > 0 && file.size <= 2097152, 'Допустим PDF-файл до 2 МБ.', 413);
  must(file.name.toLowerCase().endsWith('.pdf'), 'Разрешены только PDF-файлы.');
  must(!file.type||['application/pdf','application/octet-stream'].includes(file.type.toLowerCase()),'Тип файла должен соответствовать PDF.');
  must(!/[\u0000-\u001F\u007F]/.test(file.name),'Имя файла содержит недопустимые символы.');
  const bytes = await file.arrayBuffer();
  must(/^%PDF-[12]\.\d/.test(new TextDecoder().decode(bytes.slice(0,8)))&&
    /%%EOF\s*$/.test(new TextDecoder().decode(bytes.slice(Math.max(0,bytes.byteLength-2048)))),'Содержимое файла не соответствует PDF.');
  const id = existing?.id||uid('file');
  const objectKey = existing?.object_key||`${user.id}/${id}.pdf`;
  const stem=safeText(file.name.slice(0,-4),145).replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^[. ]+|[. ]+$/g,'');
  const filename=(stem||'document')+'.pdf';
  const previous=existing?await env.BUCKET.get(objectKey):null;
  const previousBytes=previous?await new Response(previous.body).arrayBuffer():null;
  await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  try {
    await env.DB.batch([
      existing?statement(env,'UPDATE file_documents SET original_name=?,size_bytes=? WHERE id=? AND owner_id=?',[filename,file.size,id,user.id]):
        statement(env,'INSERT INTO file_documents (id,owner_id,original_name,object_key,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?)',[id,user.id,filename,objectKey,'application/pdf',file.size,now()]),
      auditStatement(env,user,existing?'Обновление документа':'Загрузка документа','file',id,filename)
    ]);
  } catch (error) {
    if(previousBytes)await env.BUCKET.put(objectKey,previousBytes,{httpMetadata:{contentType:'application/pdf'}});
    else await env.BUCKET.delete(objectKey);
    throw error;
  }
  return json({ ok: true, id }, existing?200:201);
}

async function listRecords(env, user, type) {
  if (type === 'vacancies') {
    const filter = user && STAFF.includes(user.role_id) ? '' : "WHERE v.status='published'";
    return dbAll(env, `SELECT v.*,d.title department_title FROM vacancies v JOIN departments d ON d.id=v.department_id ${filter} ORDER BY v.created_at DESC LIMIT 100`);
  }
  if (type === 'departments') return dbAll(env, 'SELECT * FROM departments ORDER BY title');
  if (type === 'competencies') return dbAll(env, 'SELECT * FROM competencies ORDER BY title');
  if(type==='mentors'){
    requireRole(user,STAFF);
    return dbAll(env,"SELECT id,full_name FROM users WHERE active=1 AND role_id IN ('admin','hr') ORDER BY full_name");
  }
  requireRole(user, ['admin','hr','candidate']);
  if (type === 'applications') return listApplications(env, user);
  if (type === 'plans') return listPlans(env, user);
  if (type === 'interviews') {
    return dbAll(env,
      `SELECT i.*,a.candidate_id,u.full_name candidate_name,v.title vacancy_title
       FROM interviews i JOIN applications a ON a.id=i.application_id
       JOIN users u ON u.id=a.candidate_id JOIN vacancies v ON v.id=a.vacancy_id
       ${user.role_id === 'candidate' ? 'WHERE a.candidate_id=?' : ''} ORDER BY i.scheduled_at DESC LIMIT 200`,
      user.role_id === 'candidate' ? [user.id] : []);
  }
  if (type === 'files') {
    return dbAll(env, `SELECT id,owner_id,original_name,mime_type,size_bytes,created_at FROM file_documents
      ${user.role_id === 'candidate' ? 'WHERE owner_id=?' : ''} ORDER BY created_at DESC LIMIT 100`, user.role_id === 'candidate' ? [user.id] : []);
  }
  if (type === 'notifications') return dbAll(env, 'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [user.id]);
  if (type === 'requests') {
    requireRole(user, STAFF);
    return dbAll(env, 'SELECT r.*,d.title department_title FROM requests r JOIN departments d ON d.id=r.department_id ORDER BY r.created_at DESC LIMIT 100');
  }
  if (type === 'feedback') {
    requireRole(user, STAFF);
    return dbAll(env, 'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100');
  }
  requireRole(user, ['admin']);
  if (type === 'roles') return dbAll(env, 'SELECT r.id,r.title,COUNT(u.id) user_count FROM roles r LEFT JOIN users u ON u.role_id=r.id GROUP BY r.id,r.title ORDER BY r.title');
  if (type === 'users') return dbAll(env, 'SELECT u.id,u.username,u.full_name,u.role_id,u.department_id,u.active,u.created_at,d.title department_title FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.created_at');
  if (type === 'audit') return dbAll(env, 'SELECT a.*,u.full_name actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200');
  if (type === 'settings') return dbAll(env, 'SELECT key,value FROM settings ORDER BY key');
  throw new AppError(404, 'Раздел не найден.');
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  must(env.DB, 'База данных ещё не подключена.', 503);
  if (method === 'POST' && path === '/api/demo/start') {
    requireSameOrigin(request);
    await seedDemo(env);
    return json({ ok: true });
  }
  if (method === 'POST' && path === '/api/login') return login(request, env);
  const user = await readSession(request, env);
  if (method === 'GET' && path === '/api/me') return json({ user: publicUser(user) });
  if(method==='GET'&&path==='/api/sessions'){
    requireRole(user,['admin','hr','candidate']);
    const rows=await dbAll(env,'SELECT expires_at,CASE WHEN token_hash=? THEN 1 ELSE 0 END current_session FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at DESC',[user.token_hash,user.id,now()]);
    return json({rows});
  }
  if (!['GET','HEAD'].includes(method)) {
    requireSameOrigin(request);
    if (user) must(equalHash(request.headers.get('x-csrf-token') || '', user.csrf_token), 'Проверка запроса не пройдена. Обновите страницу.', 403);
  }
  const additional = await additionalOperations(request, env, user, path);
  if (additional) return additional;
  if(method==='POST'&&path==='/api/sessions/revoke-others'){
    requireRole(user,['admin','hr','candidate']);
    const result=await dbRun(env,'DELETE FROM sessions WHERE user_id=? AND token_hash<>?',[user.id,user.token_hash]);
    await auditStatement(env,user,'Завершение других сессий','user',user.id).run();
    return json({ok:true,revoked:result.meta?.changes||0});
  }
  if (method === 'POST' && path === '/api/logout') {
    if (user) await dbRun(env, 'DELETE FROM sessions WHERE token_hash=?', [user.token_hash]);
    return json({ ok: true }, 200, { 'Set-Cookie': 'witte_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }
  if (method === 'GET' && path === '/api/dashboard') return json(await dashboard(env, user));
  if(method==='GET'&&path.startsWith('/api/vacancy-profile/')){
    requireRole(user,STAFF);
    const rows=await dbAll(env,'SELECT competency_id,target_level FROM vacancy_competencies WHERE vacancy_id=?',[path.slice('/api/vacancy-profile/'.length)]);
    return json({rows});
  }
  if (method === 'GET' && path.startsWith('/api/list/')) return json({ rows: await listRecords(env, user, path.slice(10)) });
  if (path === '/api/profile') {
    requireRole(user, ['admin','hr','candidate']);
    if (method === 'GET') return json({ profile: await dbOne(env, 'SELECT * FROM profiles WHERE user_id=?', [user.id]) || {} });
    if (method === 'POST') {
      const body = await parseBody(request);
      const education = safeText(body.education, 1000);
      const experience = safeText(body.experience, 2000);
      const about = safeText(body.about, 2000);
      const consent = body.consent === true ? 1 : 0;
      await env.DB.batch([
        statement(env, `INSERT INTO profiles (user_id,education,experience,about,consent,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET education=excluded.education,experience=excluded.experience,about=excluded.about,consent=excluded.consent,updated_at=excluded.updated_at`,
          [user.id, education, experience, about, consent, now()]),
        auditStatement(env, user, 'Изменение профиля', 'profile', user.id)
      ]);
      return json({ ok: true });
    }
  }
  if (method === 'POST' && path === '/api/applications') return createApplication(request, env, user);
  if (method === 'POST' && path === '/api/vacancies') return createVacancy(request, env, user);
  if (method === 'POST' && path === '/api/assessments') return createAssessment(request, env, user);
  if (method === 'POST' && path === '/api/interviews') return createInterview(request, env, user);
  if (method === 'POST' && path === '/api/plans') return createPlan(request, env, user);
  if (method === 'POST' && path === '/api/files') return uploadFile(request, env, user);
  if (path.startsWith('/api/applications/')) {
    requireRole(user, ['admin','hr','candidate']);
    const id = path.slice(18);
    const row = await applicationFor(env, id, user);
    if (method === 'GET') {
      const events=await dbAll(env,'SELECT action,details,created_at FROM audit_events WHERE entity_type=? AND entity_id=? ORDER BY created_at,id',['application',id]);
      const history=user.role_id==='candidate'?events.filter(event=>['Создание отклика','Изменение этапа','Отзыв отклика','Изменение сопроводительного сообщения'].includes(event.action)):events;
      const assessments = user.role_id === 'candidate' ? [] : await dbAll(env,
        `SELECT c.*,vc.target_level,a.score,a.evidence,a.created_at assessment_updated_at FROM vacancy_competencies vc
         JOIN competencies c ON c.id=vc.competency_id
         LEFT JOIN assessments a ON a.competency_id=c.id AND a.application_id=?
         WHERE vc.vacancy_id=? ORDER BY c.title`, [id, row.vacancy_id]);
      return json({ application: row, assessments, history });
    }
    if (method === 'POST') {
      requireRole(user, STAFF);
      return json(await updateApplication(env, user, row, await parseBody(request)));
    }
  }
  if (path.startsWith('/api/plans/')) {
    requireRole(user, ['admin','hr','candidate']);
    const id = path.slice(11);
    const plan = await planFor(env, id, user);
    if (method === 'GET') return json({ plan, tasks: await dbAll(env, 'SELECT * FROM adaptation_tasks WHERE plan_id=? ORDER BY due_date,id', [id]) });
    if (method === 'POST') {
      requireRole(user, STAFF);
      const body = await parseBody(request);
      if (body.action === 'complete') {
        must(plan.status==='active','План уже завершён.',409);
        const count = await dbOne(env, "SELECT COUNT(*) total,SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) pending FROM adaptation_tasks WHERE plan_id=?", [id]);
        must(Number(count.total) > 0 && Number(count.pending) === 0, 'Для завершения плана необходимо выполнить все задания.');
        const changed=await dbRun(env,"UPDATE adaptation_plans SET status='completed' WHERE id=? AND status='active'",[id]);
        must(changed.meta?.changes===1,'План уже завершён.',409);
        await auditStatement(env,user,'Завершение адаптации','plan',id).run();
      } else {
        must(plan.status === 'active', 'План завершён.');
        const title = safeText(body.title, 250);
        const due = validateDate(body.due_date);
        must(title.length >= 5, 'Укажите содержание задания.');
        must(due >= plan.start_date && due <= plan.end_date, 'Срок задания должен входить в период плана.');
        await env.DB.batch([
          statement(env, 'INSERT INTO adaptation_tasks (id,plan_id,title,due_date) VALUES (?,?,?,?)', [uid('task'),id,title,due]),
          auditStatement(env, user, 'Добавление задания', 'plan', id, title)
        ]);
      }
      return json({ ok: true });
    }
  }
  if (method === 'POST' && path.startsWith('/api/tasks/')) {
    requireRole(user, STAFF);
    const id = path.slice(11);
    const task = await dbOne(env, 'SELECT * FROM adaptation_tasks WHERE id=?', [id]);
    must(task, 'Задание не найдено.', 404);
    const plan = await planFor(env, task.plan_id, user);
    must(plan.status === 'active', 'План уже завершён.');
    must(task.status==='todo','Задание уже выполнено. Для уточнения используйте исправление подтверждения.',409);
    const body = await parseBody(request);
    const evidence = safeText(body.evidence, 2000);
    must(evidence.length >= 10, 'Опишите подтверждение выполнения задания.');
    const changed=await dbRun(env,"UPDATE adaptation_tasks SET status='done',evidence=?,completed_at=? WHERE id=? AND status='todo'",[evidence,now(),id]);
    must(changed.meta?.changes===1,'Задание уже выполнено.',409);
    await auditStatement(env,user,'Выполнение задания','task',id,evidence).run();
    return json({ ok: true });
  }
  if (method === 'GET' && path.startsWith('/api/files/')) {
    requireRole(user, ['admin','hr','candidate']);
    const file = await dbOne(env, 'SELECT * FROM file_documents WHERE id=?', [path.slice(11)]);
    must(file, 'Документ не найден.', 404);
    must(user.role_id !== 'candidate' || file.owner_id === user.id, 'Документ недоступен.', 403);
    const object = await env.BUCKET.get(file.object_key);
    must(object, 'Файл отсутствует в хранилище.', 404);
    return new Response(object.body, { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
    }});
  }
  if (method === 'POST' && path === '/api/requests') {
    requireRole(user, STAFF);
    const body = await parseBody(request);
    const title = safeText(body.title,160);
    const justification = safeText(body.justification,2000);
    must(title.length >= 5 && justification.length >= 20, 'Заполните должность и обоснование потребности.');
    must(await dbOne(env, 'SELECT id FROM departments WHERE id=?', [safeText(body.department_id,100)]), 'Подразделение не найдено.');
    const id = uid('request');
    await env.DB.batch([
      statement(env, 'INSERT INTO requests (id,department_id,title,justification,status,owner_id,created_at) VALUES (?,?,?,?,?,?,?)',
        [id,body.department_id,title,justification,'submitted',user.id,now()]),
      auditStatement(env,user,'Создание заявки','request',id,title)
    ]);
    return json({ok:true,id},201);
  }
  if (method === 'POST' && path.startsWith('/api/requests/')) {
    requireRole(user, STAFF);
    const id = path.slice(14);
    const body = await parseBody(request);
    must(['approved','returned'].includes(body.status),'Неверный статус согласования.');
    const row = await dbOne(env,'SELECT * FROM requests WHERE id=?',[id]);
    must(row,'Заявка не найдена.',404);
    must(row.status === 'submitted','Заявка уже рассмотрена.',409);
    const result = await dbRun(env,"UPDATE requests SET status=?,version=version+1 WHERE id=? AND status='submitted'",[body.status,id]);
    must(result.meta?.changes===1,'Заявка уже рассмотрена.',409);
    await auditStatement(env,user,'Рассмотрение заявки','request',id,body.status).run();
    return json({ok:true});
  }
  if (method === 'POST' && path === '/api/feedback') {
    const body = await parseBody(request);
    const name = safeText(body.name,100);
    const contact = safeText(body.contact,160);
    const topic = safeText(body.topic,160);
    const message = safeText(body.message,3000);
    must(name.length >= 2 && contact.length >= 3 && topic.length >= 3 && message.length >= 15,'Заполните все поля. Сообщение должно содержать не менее 15 символов.');
    must(body.consent === true,'Подтвердите использование данных.');
    const duplicate = await dbOne(env,'SELECT id FROM feedback WHERE contact=? AND message=? AND created_at>?',[contact,message,new Date(Date.now()-60000).toISOString()]);
    must(!duplicate,'Сообщение уже отправлено.',409);
    const id=uid('feedback');
    await dbRun(env,'INSERT INTO feedback (id,name,contact,topic,message,created_at) VALUES (?,?,?,?,?,?)',[id,name,contact,topic,message,now()]);
    return json({ok:true,id},201);
  }
  if (method === 'POST' && path.startsWith('/api/admin/')) {
    requireRole(user,['admin']);
    const action=path.slice(11);
    const body=await parseBody(request);
    if(action==='departments') {
      const title=safeText(body.title,160);
      must(title.length>=3,'Укажите название подразделения.');
      const id=uid('department');
      await env.DB.batch([
        statement(env,'INSERT INTO departments (id,title,description) VALUES (?,?,?)',[id,title,safeText(body.description,1000)]),
        auditStatement(env,user,'Создание подразделения','department',id,title)
      ]);
    } else if(action==='users') {
      const target=await dbOne(env,'SELECT * FROM users WHERE id=?',[safeText(body.id,100)]);
      must(target,'Пользователь не найден.',404);
      must(target.id!==user.id,'Нельзя заблокировать собственную учётную запись.');
      const active=body.active===true?1:0;
      await env.DB.batch([
        statement(env,'UPDATE users SET active=? WHERE id=?',[active,target.id]),
        ...(active?[]:[statement(env,'DELETE FROM sessions WHERE user_id=?',[target.id])]),
        auditStatement(env,user,active?'Разблокировка пользователя':'Блокировка пользователя','user',target.id)
      ]);
    } else if(action==='settings') {
      const text=safeText(body.value,500);
      must(text.length>=3,'Введите примечание к стенду.');
      await env.DB.batch([
        statement(env,"INSERT INTO settings (key,value) VALUES ('project_note',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[text]),
        auditStatement(env,user,'Изменение примечания','setting','project_note',text)
      ]);
    } else throw new AppError(404,'Действие не найдено.');
    return json({ok:true});
  }
  if (method === 'GET' && path === '/api/export/applications.xlsx') {
    requireRole(user,STAFF);
    const apps=await listApplications(env,user);
    const rows=[['Кандидат','Вакансия','Подразделение','Этап','Оценено компетенций','Дата отклика'],
      ...apps.map(a=>[a.candidate_name,a.vacancy_title,a.department_title,a.status,a.assessment_count,a.created_at])];
    return new Response(exportXlsx(rows),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="applications.xlsx"','Cache-Control':'no-store'}});
  }
  if (method === 'GET' && path.startsWith('/api/export/plan/')) {
    requireRole(user,['admin','hr','candidate']);
    const plan=await planFor(env,path.slice(17),user);
    const tasks=await dbAll(env,'SELECT * FROM adaptation_tasks WHERE plan_id=? ORDER BY due_date',[plan.id]);
    const employee=await dbOne(env,'SELECT full_name FROM users WHERE id=?',[plan.employee_id]),mentor=await dbOne(env,'SELECT full_name FROM users WHERE id=?',[plan.mentor_id]);
    const paragraphs=[`Сотрудник: ${employee.full_name}`,`Наставник: ${mentor.full_name}`,`Период: ${plan.start_date} — ${plan.end_date}`,`Статус: ${plan.status==='active'?'В работе':'Завершён'}`,
      ...tasks.map((t,index)=>`${index+1}. ${t.title}. Срок: ${t.due_date}. ${t.status==='done'?'Выполнено':'Предстоит выполнить'}. ${t.evidence}`),
      `Сформировано: ${now().slice(0,10)}. Номер плана: ${plan.id}.`];
    return new Response(exportDocx(plan.title,paragraphs),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename="adaptation-plan.docx"','Cache-Control':'no-store'}});
  }
  if (method === 'GET' && path === '/api/health') return json({ok:true,version:'1.0.0',mode:'personnel'});
  throw new AppError(404,'Запрошенный ресурс не найден.');
}
