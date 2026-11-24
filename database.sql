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

CREATE INDEX IF NOT EXISTS idx_fk_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_fk_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_fk_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_requests_owner_id ON requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_fk_requests_department_id ON requests(department_id);
CREATE INDEX IF NOT EXISTS idx_fk_vacancies_department_id ON vacancies(department_id);
CREATE INDEX IF NOT EXISTS idx_fk_vacancies_request_id ON vacancies(request_id);
CREATE INDEX IF NOT EXISTS idx_fk_vacancy_competencies_competency_id ON vacancy_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_fk_assessments_assessor_id ON assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_fk_assessments_competency_id ON assessments(competency_id);
CREATE INDEX IF NOT EXISTS idx_fk_interviews_interviewer_id ON interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_fk_interviews_application_id ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_plans_mentor_id ON adaptation_plans(mentor_id);
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_plans_employee_id ON adaptation_plans(employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_tasks_plan_id ON adaptation_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_file_documents_owner_id ON file_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_fk_audit_events_actor_id ON audit_events(actor_id);

INSERT INTO "roles" ("id","title") VALUES ('admin','Администратор');

INSERT INTO "roles" ("id","title") VALUES ('hr','Специалист службы персонала');

INSERT INTO "roles" ("id","title") VALUES ('candidate','Соискатель / новый сотрудник');

INSERT INTO "departments" ("id","title","description") VALUES ('personnel','Служба персонала','Подбор, сопровождение оценки и адаптации сотрудников');

INSERT INTO "departments" ("id","title","description") VALUES ('student-office','Студенческий офис','Организационное сопровождение обучающихся');

INSERT INTO "departments" ("id","title","description") VALUES ('it','Департамент информационных технологий','Развитие и сопровождение информационных систем');

INSERT INTO "departments" ("id","title","description") VALUES ('office','Канцелярия','Регистрация и сопровождение документов');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('admin','admin','Администратор','3ef430eba77a75ceb455865fe4d5ec674f5b9b58a9a5458c223e9203f50af20c','8136ed4a-55d1-4a0a-b613-8e3639f07883','admin','it',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('hr','hr','Специалист службы персонала','a166f3aaaaa33cc5cfbdf016832bcfd69b64a6c9db20f7c1c3338487ab88b28e','28d7a1be-55ab-4058-bebd-e3d95124b140','hr','personnel',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate','candidate','Дарья Волкова','93cd5697cdc62d551a0d1b9070df804b4ff1549de85c19bf986d85296f9a6d60','26cd09ab-0b5d-44c5-87cc-feb194cfd6fa','candidate',NULL,1,'2026-11-24T16:41:17.255Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-2','candidate2','Михаил Белов','f718c331779a16be4a68363edb0c4b6fd8b1bfb4953f0c102606c961a2f5f7d1','6b42bbb1-b23a-419a-9d59-75a571e2859e','candidate',NULL,1,'2026-11-24T16:41:17.255Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-3','candidate3','Анна Орлова','35bd59c5c747e3095174e067dbbb27ad6307c2df748f119a8e9edd9102509c7a','8cb253c4-94f1-4664-9ffd-9f06438aef8c','candidate',NULL,1,'2026-11-24T16:41:17.255Z');

INSERT INTO "users" ("id","username","full_name","password_hash","salt","role_id","department_id","active","created_at") VALUES ('candidate-4','candidate4','Иван Морозов','1b03994f71aaa2c744a370a480271a06f75e58766c99116c58b202d1e9b4d521','58b4b59a-f3e0-4509-b0d9-834a24f7e9ad','candidate',NULL,1,'2026-11-24T16:41:17.255Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-2','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-3','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "profiles" ("user_id","education","experience","about","consent","updated_at") VALUES ('candidate-4','Высшее образование · демонстрационный пример','Опыт работы с обращениями и документами','Карточка для проверки функций сервиса. Сведения вымышлены.',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-student-manager','student-office','Менеджер студенческого офиса','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-support-specialist','it','Специалист поддержки информационных систем','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-records-specialist','office','Специалист по документообороту','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "requests" ("id","department_id","title","justification","status","owner_id","version","created_at") VALUES ('req-hr-coordinator','personnel','Координатор адаптации персонала','Заявка на подбор для проверки маршрута согласования.','approved','hr',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('student-manager','req-student-manager','student-office','Менеджер студенческого офиса','Приём обращений обучающихся, проверка комплектности заявлений и подготовка справок. Вакансия для демонстрации процесса.','Работа с офисными приложениями, грамотная речь, внимательность к документам.','График согласуется при собеседовании','published',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('support-specialist','req-support-specialist','it','Специалист поддержки информационных систем','Регистрация заявок пользователей, первичная диагностика и передача сложных обращений профильным специалистам. Пример.','Понимание устройства веб-приложений, умение описывать неисправности и работать по инструкции.','График согласуется при собеседовании','published',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('records-specialist','req-records-specialist','office','Специалист по документообороту','Регистрация входящих документов, контроль реквизитов и соблюдения установленных сроков. Пример.','Навыки деловой переписки, систематизации документов и работы с электронными реестрами.','График согласуется при собеседовании','published',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "vacancies" ("id","request_id","department_id","title","description","requirements","schedule","status","version","created_at") VALUES ('hr-coordinator','req-hr-coordinator','personnel','Координатор адаптации персонала','Сопровождение планов адаптации, организация встреч с наставниками и сбор подтверждений выполнения задач. Пример.','Организация встреч, работа с таблицами, внимание к срокам и защите служебной информации.','График согласуется при собеседовании','published',1,'2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-1','student-manager','candidate','Отклик. Хочу применить навыки работы с обращениями и документами.','interview','',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-2','support-specialist','candidate-2','Отклик. Хочу применить навыки работы с обращениями и документами.','review','',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-3','records-specialist','candidate-3','Отклик. Хочу применить навыки работы с обращениями и документами.','hired','Решение после проверки всех компетенций.',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-4','hr-coordinator','candidate-4','Отклик. Хочу применить навыки работы с обращениями и документами.','new','',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-5','hr-coordinator','candidate-2','Отклик. Хочу применить навыки работы с обращениями и документами.','new','',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

INSERT INTO "applications" ("id","vacancy_id","candidate_id","cover_letter","status","decision_note","version","created_at","updated_at") VALUES ('app-6','student-manager','candidate-4','Отклик. Хочу применить навыки работы с обращениями и документами.','review','',1,'2026-11-18T09:00:00.000Z','2026-11-24T16:41:17.255Z');

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

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_ce6a3a7a-df3c-4282-89f6-bf5ea716f5d4','app-1','communication','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_8edc858f-1ce5-4ab6-8126-6097d92b2a09','app-1','documents','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_77e7f847-7289-423a-ba8f-f369f1016875','app-1','digital','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_daf3a69c-4b04-437c-95e4-c84356afc9b5','app-1','planning','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_ca880b97-d2de-4f64-b965-0c32a2b7666e','app-1','privacy','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_ecb93e15-24a3-4c99-a11b-ade9ab7d85cb','app-3','communication','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_cfea1f99-9989-4fb4-b9df-0ac98a3f33fe','app-3','documents','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_48d8226d-62eb-45eb-b2b0-3353ad52ce44','app-3','digital','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_8f3605e7-2220-4b7b-960a-5a1481b55284','app-3','planning','hr',4,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "assessments" ("id","application_id","competency_id","assessor_id","score","evidence","created_at") VALUES ('assessment_17a3d6b7-ee49-4b3d-a954-ce5a5c0830fe','app-3','privacy','hr',3,'Демонстрационный результат ситуационного задания. Оценка внесена специалистом.','2026-11-24T16:41:17.255Z');

INSERT INTO "interviews" ("id","application_id","interviewer_id","scheduled_at","format","result","status","created_at") VALUES ('interview-1','app-1','hr','2026-11-27T10:00','Видеовстреча · пример','','planned','2026-11-24T16:41:17.255Z');

INSERT INTO "adaptation_plans" ("id","application_id","employee_id","mentor_id","title","start_date","end_date","status","created_at") VALUES ('plan-1','app-3','candidate-3','hr','Первый месяц специалиста по документообороту','2026-11-23','2026-12-23','active','2026-11-24T16:41:17.255Z');

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-1','plan-1','Ознакомиться с правилами внутреннего распорядка','2026-11-25','done','Ознакомление подтверждено в сценарии.','2026-11-24T16:41:17.255Z');

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-2','plan-1','Получить доступ к информационным ресурсам','2026-11-26','todo','',NULL);

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-3','plan-1','Разобрать маршрут регистрации документа с наставником','2026-11-27','todo','',NULL);

INSERT INTO "adaptation_tasks" ("id","plan_id","title","due_date","status","evidence","completed_at") VALUES ('task-4','plan-1','Выполнить задание и получить обратную связь','2026-11-28','todo','',NULL);

INSERT INTO "notifications" ("id","user_id","title","body","read_at","created_at") VALUES ('notice-welcome','candidate','Приглашение на собеседование','Дата и формат доступны в разделе «Мои собеседования».',NULL,'2026-11-24T16:41:17.255Z');

INSERT INTO "audit_events" ("id","actor_id","action","entity_type","entity_id","details","created_at") VALUES ('event_66b2f01d-4e65-4755-8de5-7339caa347b1','admin','Создание набора','demo','initial','Все персональные записи вымышлены.','2026-11-24T16:41:17.255Z');

INSERT INTO "settings" ("key","value") VALUES ('demo_initialized','2026-11-24T16:41:17.255Z');
COMMIT;
