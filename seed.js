import { uid, now, hashPassword } from './security.js';
import { dbOne, statement } from './db.js';

export const DEMO_PASSWORD = 'WitteDemo2026!';

export async function seedDemo(env) {
  const present = await dbOne(env, 'SELECT value FROM settings WHERE key=?', ['demo_initialized']);
  if (present) return false;
  const date = now();
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(DEMO_PASSWORD, salt);
  const operations = [];
  const put = (sql, args) => operations.push(statement(env, sql, args));
  put('INSERT INTO settings (key,value) VALUES (?,?)', ['demo_initialized', date]);
  for (const [id, title] of [['admin','Администратор'], ['hr','Специалист службы персонала'], ['candidate','Соискатель / новый сотрудник']]) {
    put('INSERT INTO roles (id,title) VALUES (?,?)', [id, title]);
  }
  const departments = [
    ['personnel','Служба персонала','Подбор, сопровождение оценки и адаптации сотрудников'],
    ['student-office','Студенческий офис','Организационное сопровождение обучающихся'],
    ['it','Департамент информационных технологий','Развитие и сопровождение информационных систем'],
    ['office','Канцелярия','Регистрация и сопровождение документов']
  ];
  for (const row of departments) put('INSERT INTO departments (id,title,description) VALUES (?,?,?)', row);
  const people = [
    ['admin','admin','Учебный администратор','admin','it'],
    ['hr','hr','Учебный специалист службы персонала','hr','personnel'],
    ['candidate','candidate','Дарья Волкова · учебная запись','candidate',null],
    ['candidate-2','candidate2','Михаил Белов · учебная запись','candidate',null],
    ['candidate-3','candidate3','Анна Орлова · учебная запись','candidate',null],
    ['candidate-4','candidate4','Иван Морозов · учебная запись','candidate',null]
  ];
  for (const [id, username, fullName, role, department] of people) {
    put('INSERT INTO users (id,username,full_name,password_hash,salt,role_id,department_id,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, username, fullName, passwordHash, salt, role, department, 1, date]);
    if (role === 'candidate') {
      put('INSERT INTO profiles (user_id,education,experience,about,consent,updated_at) VALUES (?,?,?,?,?,?)',
        [id, 'Высшее образование · демонстрационный пример', 'Опыт работы с обращениями и документами',
          'Учебная карточка для проверки функций сервиса. Сведения вымышлены.', 1, date]);
    }
  }
  const jobs = [
    ['student-manager','student-office','Менеджер студенческого офиса',
      'Приём обращений обучающихся, проверка комплектности заявлений и подготовка справок. Учебная вакансия для демонстрации процесса.',
      'Работа с офисными приложениями, грамотная речь, внимательность к документам.'],
    ['support-specialist','it','Специалист поддержки информационных систем',
      'Регистрация заявок пользователей, первичная диагностика и передача сложных обращений профильным специалистам. Учебный пример.',
      'Понимание устройства веб-приложений, умение описывать неисправности и работать по инструкции.'],
    ['records-specialist','office','Специалист по документообороту',
      'Регистрация входящих документов, контроль реквизитов и соблюдения установленных сроков. Учебный пример.',
      'Навыки деловой переписки, систематизации документов и работы с электронными реестрами.'],
    ['hr-coordinator','personnel','Координатор адаптации персонала',
      'Сопровождение планов адаптации, организация встреч с наставниками и сбор подтверждений выполнения задач. Учебный пример.',
      'Организация встреч, работа с таблицами, внимание к срокам и защите служебной информации.']
  ];
  for (const [id, department, title, description, requirements] of jobs) {
    put('INSERT INTO requests (id,department_id,title,justification,status,owner_id,created_at) VALUES (?,?,?,?,?,?,?)',
      [`req-${id}`, department, title, 'Учебная заявка на подбор для проверки маршрута согласования.', 'approved', 'hr', date]);
    put('INSERT INTO vacancies (id,request_id,department_id,title,description,requirements,schedule,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `req-${id}`, department, title, description, requirements, 'График согласуется при собеседовании', 'published', date]);
  }
  const competencies = [
    ['communication','Деловое общение','Понятное и корректное объяснение порядка действий заявителю.',3],
    ['documents','Работа с документами','Проверка реквизитов, комплектности и соблюдения инструкции.',4],
    ['digital','Цифровые навыки','Работа с таблицами, формами и корпоративными информационными системами.',3],
    ['planning','Организация работы','Приоритизация поручений и контроль сроков исполнения.',2],
    ['privacy','Обращение со служебной информацией','Разграничение доступа и соблюдение правил работы с данными.',4]
  ];
  for (const row of competencies) put('INSERT INTO competencies (id,title,description,weight) VALUES (?,?,?,?)', row);
  for (const job of jobs) {
    for (const competency of competencies) {
      put('INSERT INTO vacancy_competencies (vacancy_id,competency_id,target_level) VALUES (?,?,?)', [job[0], competency[0], 3]);
    }
  }
  const applications = [
    ['app-1','student-manager','candidate','interview'],
    ['app-2','support-specialist','candidate-2','review'],
    ['app-3','records-specialist','candidate-3','hired'],
    ['app-4','hr-coordinator','candidate-4','new'],
    ['app-5','hr-coordinator','candidate-2','new'],
    ['app-6','student-manager','candidate-4','review']
  ];
  for (const [id, job, candidate, status] of applications) {
    put('INSERT INTO applications (id,vacancy_id,candidate_id,cover_letter,status,decision_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, job, candidate, 'Учебный отклик. Хочу применить навыки работы с обращениями и документами.', status,
        status === 'hired' ? 'Учебное решение после проверки всех компетенций.' : '', '2026-11-18T09:00:00.000Z', date]);
  }
  for (const app of ['app-1','app-3']) {
    for (const [index, competency] of competencies.entries()) {
      put('INSERT INTO assessments (id,application_id,competency_id,assessor_id,score,evidence,created_at) VALUES (?,?,?,?,?,?,?)',
        [uid('assessment'), app, competency[0], 'hr', index % 2 ? 4 : 3,
          'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.', date]);
    }
  }
  put('INSERT INTO interviews (id,application_id,interviewer_id,scheduled_at,format,status,created_at) VALUES (?,?,?,?,?,?,?)',
    ['interview-1','app-1','hr','2026-11-27T10:00','Видеовстреча · учебный пример','planned',date]);
  put('INSERT INTO adaptation_plans (id,application_id,employee_id,mentor_id,title,start_date,end_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ['plan-1','app-3','candidate-3','hr','Первый месяц специалиста по документообороту','2026-11-23','2026-12-23','active',date]);
  for (const [index,title] of [
    'Ознакомиться с правилами внутреннего распорядка',
    'Получить доступ к учебным информационным ресурсам',
    'Разобрать маршрут регистрации документа с наставником',
    'Выполнить учебное задание и получить обратную связь'
  ].entries()) {
    put('INSERT INTO adaptation_tasks (id,plan_id,title,due_date,status,evidence,completed_at) VALUES (?,?,?,?,?,?,?)',
      [`task-${index+1}`,'plan-1',title,`2026-11-${25+index}`,
        index === 0 ? 'done' : 'todo',index === 0 ? 'Ознакомление подтверждено в учебном сценарии.' : '',index === 0 ? date : null]);
  }
  put('INSERT INTO notifications (id,user_id,title,body,created_at) VALUES (?,?,?,?,?)',
    ['notice-welcome','candidate','Приглашение на собеседование','Дата и формат доступны в разделе «Мои собеседования».',date]);
  put('INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)',
    [uid('event'),'admin','Создание учебного набора','demo','initial','Все персональные записи вымышлены.',date]);
  try {
    await env.DB.batch(operations);
    return true;
  } catch (error) {
    const initialized = await dbOne(env, 'SELECT value FROM settings WHERE key=?', ['demo_initialized']);
    if (initialized) return false;
    throw error;
  }
}
