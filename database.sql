-- PostgreSQL: схема и начальное наполнение кадровой системы
BEGIN;
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  department_id TEXT REFERENCES departments(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  education TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  title TEXT NOT NULL,
  justification TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','approved','returned')),
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE vacancies (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES requests(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  schedule TEXT NOT NULL DEFAULT 'Полная занятость',
  status TEXT NOT NULL CHECK (status IN ('draft','published','closed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  vacancy_id TEXT NOT NULL REFERENCES vacancies(id),
  candidate_id TEXT NOT NULL REFERENCES users(id),
  cover_letter TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('new','review','interview','offer','hired','rejected','withdrawn')),
  decision_note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(vacancy_id,candidate_id)
);

CREATE TABLE competencies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 10)
);

CREATE TABLE vacancy_competencies (
  vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competencies(id),
  target_level INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 5),
  PRIMARY KEY (vacancy_id,competency_id)
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competencies(id),
  assessor_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(application_id,competency_id)
);

CREATE TABLE interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_id TEXT NOT NULL REFERENCES users(id),
  scheduled_at TEXT NOT NULL,
  format TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')),
  created_at TEXT NOT NULL
);

CREATE TABLE adaptation_plans (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  employee_id TEXT NOT NULL REFERENCES users(id),
  mentor_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE TABLE adaptation_tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES adaptation_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  evidence TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);

CREATE TABLE file_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL
);

CREATE INDEX applications_status_idx ON applications(status,created_at);

CREATE INDEX applications_candidate_idx ON applications(candidate_id,created_at);

CREATE INDEX vacancies_status_idx ON vacancies(status,created_at);

CREATE INDEX interviews_date_idx ON interviews(scheduled_at,status);

CREATE INDEX tasks_due_idx ON adaptation_tasks(due_date,status);

CREATE INDEX audit_date_idx ON audit_events(created_at);

CREATE INDEX notifications_user_idx ON notifications(user_id,read_at);

CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

INSERT INTO "roles" ("id","title") VALUES ('admin','Администратор');

INSERT INTO "roles" ("id","title") VALUES ('hr','Специалист службы персонала');

INSERT INTO "roles" ("id","title") VALUES ('candidate','Соискатель / новый сотрудник');

INSERT INTO "departments" ("id","title","description") VALUES ('personnel','Служба персонала','Подбор, сопровождение оценки и адаптации сотрудников');

INSERT INTO "departments" ("id","title","description") VALUES ('student-office','Студенческий офис','Организационное сопровождение обучающихся');

INSERT INTO "departments" ("id","title","description") VALUES ('it','Департамент информационных технологий','Развитие и сопровождение информационных систем');

INSERT INTO "departments" ("id","title","description") VALUES ('office','Канцелярия','Регистрация и сопровождение документов');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('admin','admin','Администратор','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','admin','it',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('hr','hr','Специалист службы персонала','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','hr','personnel',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate','candidate','Дарья Волкова','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','candidate',NULL,1,'2026-11-24T11:29:00.630Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-2','candidate2','Михаил Белов','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','candidate',NULL,1,'2026-11-24T11:29:00.630Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-3','candidate3','Анна Орлова','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','candidate',NULL,1,'2026-11-24T11:29:00.630Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-4','candidate4','Иван Морозов','24e8eb9f75f53f4a67d5b6d98bc4212ce7c0d0d7bccb9ef242de157e14812d19','f8779f14-8683-47e6-ae9c-ec493b29dea1','candidate',NULL,1,'2026-11-24T11:29:00.630Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-2','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-3','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-4','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-student-manager','student-office','Менеджер студенческого офиса','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-support-specialist','it','Специалист поддержки информационных систем','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-records-specialist','office','Специалист по документообороту','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-hr-coordinator','personnel','Координатор адаптации персонала','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('student-manager','req-student-manager','student-office','Менеджер студенческого офиса','Приём обращений обучающихся, проверка комплектности заявлений и подготовка справок. Вакансия для демонстрации процесса.','Работа с офисными приложениями, грамотная речь, внимательность к документам.','График согласуется при собеседовании','published',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('support-specialist','req-support-specialist','it','Специалист поддержки информационных систем','Регистрация заявок пользователей, первичная диагностика и передача сложных обращений профильным специалистам. Пример.','Понимание устройства веб-приложений, умение описывать неисправности и работать по инструкции.','График согласуется при собеседовании','published',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('records-specialist','req-records-specialist','office','Специалист по документообороту','Регистрация входящих документов, контроль реквизитов и соблюдения установленных сроков. Пример.','Навыки деловой переписки, систематизации документов и работы с электронными реестрами.','График согласуется при собеседовании','published',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('hr-coordinator','req-hr-coordinator','personnel','Координатор адаптации персонала','Сопровождение планов адаптации, организация встреч с наставниками и сбор подтверждений выполнения задач. Пример.','Организация встреч, работа с таблицами, внимание к срокам и защите служебной информации.','График согласуется при собеседовании','published',1,'2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-1','student-manager','candidate','Отклик. Хочу применить навыки работы с обращениями и документами.','interview','',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-2','support-specialist','candidate-2','Отклик. Хочу применить навыки работы с обращениями и документами.','review','',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-3','records-specialist','candidate-3','Отклик. Хочу применить навыки работы с обращениями и документами.','hired','Решение после проверки всех компетенций.',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-4','hr-coordinator','candidate-4','Отклик. Хочу применить навыки работы с обращениями и документами.','new','',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-5','hr-coordinator','candidate-2','Отклик. Хочу применить навыки работы с обращениями и документами.','new','',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-6','student-manager','candidate-4','Отклик. Хочу применить навыки работы с обращениями и документами.','review','',1,'2026-11-18T09:00:00.000Z','2026-11-24T11:29:00.630Z');

INSERT INTO "competencies" ("id","title","description","weight") VALUES ('communication','Деловое общение','Понятное и корректное объяснение порядка действий заявителю.',3);

INSERT INTO "competencies" ("id","title","description","weight") VALUES ('documents','Работа с документами','Проверка реквизитов, комплектности и соблюдения инструкции.',4);

INSERT INTO "competencies" ("id","title","description","weight") VALUES ('digital','Цифровые навыки','Работа с таблицами, формами и корпоративными информационными системами.',3);

INSERT INTO "competencies" ("id","title","description","weight") VALUES ('planning','Организация работы','Приоритизация поручений и контроль сроков исполнения.',2);

INSERT INTO "competencies" ("id","title","description","weight") VALUES ('privacy','Обращение со служебной информацией','Разграничение доступа и соблюдение правил работы с данными.',4);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('student-manager','communication',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('student-manager','documents',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('student-manager','digital',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('student-manager','planning',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('student-manager','privacy',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('support-specialist','communication',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('support-specialist','documents',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('support-specialist','digital',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('support-specialist','planning',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('support-specialist','privacy',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('records-specialist','communication',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('records-specialist','documents',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('records-specialist','digital',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('records-specialist','planning',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('records-specialist','privacy',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('hr-coordinator','communication',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('hr-coordinator','documents',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('hr-coordinator','digital',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('hr-coordinator','planning',3);

INSERT INTO "vacancy_competencies" ("vacancy_id","competency_id","target_level") VALUES ('hr-coordinator','privacy',3);

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_f20f0fa6-dfd7-4f04-8671-77f06e883977','app-1','communication','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_fc78c0ae-5676-49f3-8105-de2d9d825a0d','app-1','documents','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_b37e6acf-a110-4c20-9dac-f097d306dad6','app-1','digital','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_1a83e54c-c805-40e1-9978-852c8a38a4a6','app-1','planning','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_ec31fdaa-4fe0-413a-84f8-6c8fbfffe42d','app-1','privacy','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_b440b9f7-39be-4e89-8b19-2efccd47e854','app-3','communication','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_67306ea5-0cf5-4d39-af6f-13886378595a','app-3','documents','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_a03c8ff9-f863-4380-a3e1-6a4dea5ec01c','app-3','digital','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_4bb0b208-7001-4786-97f8-10e6b914b474','app-3','planning','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_8a009672-0a2b-4858-be57-a72df4b111db','app-3','privacy','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T11:29:00.630Z');

INSERT INTO "interviews" ("id","application_id","interviewer_id","scheduled_at","format","result","status","created_at") VALUES ('interview-1','app-1','hr','2026-11-27T10:00','Видеовстреча · пример','','planned','2026-11-24T11:29:00.630Z');

INSERT INTO "adaptation_plans" ("id","application_id","employee_id","mentor_id","title","start_date","end_date","status","created_at") VALUES ('plan-1','app-3','candidate-3','hr','Первый месяц специалиста по документообороту','2026-11-23','2026-12-23','active','2026-11-24T11:29:00.630Z');

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-1','plan-1','Ознакомиться с правилами внутреннего распорядка','2026-11-25','done','Ознакомление подтверждено в сценарии.','2026-11-24T11:29:00.630Z');

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-2','plan-1','Получить доступ к информационным ресурсам','2026-11-26','todo','',NULL);

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-3','plan-1','Разобрать маршрут регистрации документа с наставником','2026-11-27','todo','',NULL);

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-4','plan-1','Выполнить задание и получить обратную связь','2026-11-28','todo','',NULL);

INSERT INTO "notifications" ("id","user_id","title","body","read_at","created_at") VALUES ('notice-welcome','candidate','Приглашение на собеседование','Дата и формат доступны в разделе «Мои собеседования».',NULL,'2026-11-24T11:29:00.630Z');

INSERT INTO "audit_events" ("id","actor_id","action","entity_type","entity_id","details","created_at") VALUES ('event_ff602cb0-05c5-4082-af27-dcc76f432c91','admin','Создание набора','demo','initial','Все персональные записи вымышлены.','2026-11-24T11:29:00.630Z');

INSERT INTO "settings" ("key","value") VALUES ('demo_initialized','2026-11-24T11:29:00.630Z');
COMMIT;
