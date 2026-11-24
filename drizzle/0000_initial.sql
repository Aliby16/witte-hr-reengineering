PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  education TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1)),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE competencies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE vacancy_competencies (
  vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competencies(id),
  target_level INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 5),
  PRIMARY KEY (vacancy_id,competency_id)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE adaptation_tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES adaptation_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  evidence TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
--> statement-breakpoint
CREATE TABLE file_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX applications_status_idx ON applications(status,created_at);
--> statement-breakpoint
CREATE INDEX applications_candidate_idx ON applications(candidate_id,created_at);
--> statement-breakpoint
CREATE INDEX vacancies_status_idx ON vacancies(status,created_at);
--> statement-breakpoint
CREATE INDEX interviews_date_idx ON interviews(scheduled_at,status);
--> statement-breakpoint
CREATE INDEX tasks_due_idx ON adaptation_tasks(due_date,status);
--> statement-breakpoint
CREATE INDEX audit_date_idx ON audit_events(created_at);
--> statement-breakpoint
CREATE INDEX notifications_user_idx ON notifications(user_id,read_at);
--> statement-breakpoint
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_users_department_id ON users(department_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_users_role_id ON users(role_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_sessions_user_id ON sessions(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_requests_owner_id ON requests(owner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_requests_department_id ON requests(department_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_vacancies_department_id ON vacancies(department_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_vacancies_request_id ON vacancies(request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_vacancy_competencies_competency_id ON vacancy_competencies(competency_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_assessments_assessor_id ON assessments(assessor_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_assessments_competency_id ON assessments(competency_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_interviews_interviewer_id ON interviews(interviewer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_interviews_application_id ON interviews(application_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_plans_mentor_id ON adaptation_plans(mentor_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_plans_employee_id ON adaptation_plans(employee_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_adaptation_tasks_plan_id ON adaptation_tasks(plan_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_file_documents_owner_id ON file_documents(owner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_audit_events_actor_id ON audit_events(actor_id);
