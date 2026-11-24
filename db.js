import { uid, now, must, AppError, digest, parseCookies } from './security.js';

export async function dbAll(env, sql, values = []) {
  const result = await env.DB.prepare(sql).bind(...values).all();
  return result.results || [];
}

export async function dbOne(env, sql, values = []) {
  return env.DB.prepare(sql).bind(...values).first();
}

export async function dbRun(env, sql, values = []) {
  return env.DB.prepare(sql).bind(...values).run();
}

export function statement(env, sql, values = []) {
  return env.DB.prepare(sql).bind(...values);
}

export function auditStatement(env, actor, action, entity, entityId, details = '') {
  return statement(env,
    'INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)',
    [uid('event'), actor?.id || null, action, entity, entityId, details, now()]);
}

export function notificationStatement(env, userId, title, body) {
  return statement(env,
    'INSERT INTO notifications (id,user_id,title,body,created_at) VALUES (?,?,?,?,?)',
    [uid('notice'), userId, title, body, now()]);
}

export async function readSession(request, env) {
  const raw = parseCookies(request.headers.get('cookie') || '').witte_session;
  if (!raw || raw.length > 150) return null;
  const tokenHash = await digest(raw);
  const user = await dbOne(env,
    `SELECT u.id,u.username,u.full_name,u.role_id,u.department_id,s.csrf_token,s.token_hash
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`, [tokenHash, now()]);
  return user;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, username: user.username, full_name: user.full_name,
    role_id: user.role_id, department_id: user.department_id, csrf_token: user.csrf_token
  };
}

export async function applicationFor(env, id, user) {
  const row = await dbOne(env,
    `SELECT a.*,v.title vacancy_title,u.full_name candidate_name
     FROM applications a JOIN vacancies v ON v.id=a.vacancy_id
     JOIN users u ON u.id=a.candidate_id WHERE a.id=?`, [id]);
  must(row, 'Отклик не найден.', 404);
  must(user && (user.role_id !== 'candidate' || row.candidate_id === user.id), 'Отклик недоступен.', 403);
  return row;
}

export async function planFor(env, id, user) {
  const row = await dbOne(env, 'SELECT * FROM adaptation_plans WHERE id=?', [id]);
  must(row, 'План адаптации не найден.', 404);
  must(user && (user.role_id !== 'candidate' || row.employee_id === user.id), 'План недоступен.', 403);
  return row;
}

export const applicationTransitions = {
  new: ['review', 'rejected'],
  review: ['interview', 'rejected'],
  interview: ['offer', 'rejected'],
  offer: ['hired', 'rejected'],
  hired: [], rejected: [], withdrawn: []
};

export async function updateApplication(env, user, row, body) {
  must(applicationTransitions[row.status]?.includes(body.status), 'Этот переход между этапами не предусмотрен.');
  must(Number(body.version) === row.version, 'Карточка уже изменена. Обновите страницу.', 409);
  const note = String(body.decision_note || '').trim().slice(0, 2000);
  if (['rejected', 'hired', 'offer'].includes(body.status)) {
    must(note.length >= 10, 'Укажите обоснование кадрового решения не короче 10 символов.');
  }
  if (['offer', 'hired'].includes(body.status)) {
    const counts = await dbOne(env,
      `SELECT COUNT(vc.competency_id) required,
       COUNT(a.competency_id) evaluated
       FROM vacancy_competencies vc LEFT JOIN assessments a
       ON a.competency_id=vc.competency_id AND a.application_id=? WHERE vc.vacancy_id=?`,
      [row.id, row.vacancy_id]);
    must(counts.required > 0 && counts.evaluated === counts.required,
      'Сначала заполните оценку всех компетенций вакансии.');
  }
  const changed = await dbRun(env,
    'UPDATE applications SET status=?,decision_note=?,version=version+1,updated_at=? WHERE id=? AND version=?',
    [body.status, note, now(), row.id, row.version]);
  must((changed.meta?.changes || 0) === 1, 'Карточка уже изменена. Обновите страницу.', 409);
  await env.DB.batch([
    auditStatement(env, user, 'Изменение этапа', 'application', row.id, `${row.status} → ${body.status}: ${note}`),
    notificationStatement(env, row.candidate_id, 'Изменился статус отклика', `Вакансия: ${row.vacancy_title}. Откройте раздел «Мои отклики».`)
  ]);
  return { ok: true, version: row.version + 1 };
}
