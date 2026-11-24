export function safeReturnPath(value){
  if(typeof value!=='string'||value.length>600||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001F]/.test(value))return '/app/dashboard';
  try{
    const url=new URL(value,'https://local.invalid');
    if(url.origin!=='https://local.invalid'||!/^\/(app\/[a-z-]+|p\/vacancies)$/.test(url.pathname))return '/app/dashboard';
    return url.pathname+url.search;
  }catch{return '/app/dashboard';}
}

export function clientBootstrap(safeReturnPath) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const root = $('#page-content');
  let user = null;
  let currentRows = [];
  let currentPage = '';
  let assessmentRevisions=[];
  let recordPage=1,currentView=[];
  const pageSize=20;
  let modalOpener=null,previousOverflow='';
  const statusNames = {
    new:'Новый',review:'На рассмотрении',interview:'Собеседование',offer:'Предложение',hired:'Принят',
    rejected:'Отказ',withdrawn:'Отозван',published:'Опубликована',draft:'Черновик',closed:'Закрыта',
    submitted:'На согласовании',approved:'Согласована',returned:'Возвращена',planned:'Запланировано',
    completed:'Завершено',cancelled:'Отменено',active:'В работе',todo:'Предстоит',done:'Выполнено'
  };
  const roleNames = {admin:'Администратор',hr:'Служба персонала',candidate:'Соискатель / сотрудник'};
  const privateLabels = {
    dashboard:'Обзор',profile:'Мой профиль',applications:'Отклики',interviews:'Собеседования',
    plans:'Адаптация',files:'Документы',notifications:'Уведомления',requests:'Заявки на подбор',
    vacancies:'Управление вакансиями',competencies:'Компетенции',reports:'Отчёты',
    users:'Пользователи',departments:'Подразделения',roles:'Роли и доступ',audit:'Журнал событий',settings:'Настройки',feedback:'Обращения'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleString('ru-RU',{dateStyle:'short',...(value.includes('T')?{timeStyle:'short'}:{})}) : '—';
  const pill = status => `<span class="pill ${['hired','done','completed','approved'].includes(status)?'success':['new','submitted','todo'].includes(status)?'warning':''}">${esc(statusNames[status]||status)}</span>`;
  const button = (text, action, id='', secondary=false) => `<button type="button" class="${secondary?'secondary':''}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
  const fieldLimits={username:[3,60],password:[1,128],full_name:[5,160],title:[5,160],description:[20,4000],requirements:[10,3000],education:[3,1000],experience:[0,2000],about:[0,2000],cover_letter:[10,2000],evidence:[10,2000],decision_note:[0,2000],justification:[20,2000],format:[3,250],result:[10,2500],name:[2,100],contact:[3,160],topic:[3,160],message:[15,3000],schedule:[0,200],value:[3,500]};
  const limits=name=>fieldLimits[name]?`minlength="${fieldLimits[name][0]}" maxlength="${fieldLimits[name][1]}"`:'';
  const help=name=>fieldLimits[name]?`<span class="small muted">${fieldLimits[name][0]?`От ${fieldLimits[name][0]} до`:'До'} ${fieldLimits[name][1]} символов</span>`:'';
  const input = (label,name,type='text',value='',required=true,extra='') => `<label>${label}<input type="${type}" name="${name}" value="${esc(value)}" ${required?'required':''} ${['text','password','search'].includes(type)?limits(name):''} ${extra}>${['text','password'].includes(type)?help(name):''}</label>`;
  const area = (label,name,value='',required=true) => `<label>${label}<textarea name="${name}" ${required?'required':''} ${limits(name)}>${esc(value)}</textarea>${help(name)}</label>`;
  const select = (label,name,options,value='') => `<label>${label}<select name="${name}" required>${options.map(([id,text])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const heading = (title, description='') => `<h1>${esc(title)}</h1>${description?`<p class="lead">${esc(description)}</p>`:''}`;
  const form = (action,body,submit='Сохранить',id='') => `<form class="form" data-form="${action}" data-id="${esc(id)}">${body}<p class="form-error" role="alert" tabindex="-1" hidden></p><div class="actions"><button type="submit">${submit}</button></div></form>`;
  const empty = message => `<div class="empty">${esc(message)}</div>`;
  function toast(message,error=false) {
    const element=document.createElement('div');
    element.className=`toast${error?' error':''}`;
    element.textContent=message;
    $('#toasts').append(element);
    setTimeout(()=>element.remove(),6500);
  }
  async function api(path,method='GET',body=null) {
    const headers={};
    if(body && !(body instanceof FormData)) headers['Content-Type']='application/json';
    if(user?.csrf_token) headers['X-CSRF-Token']=user.csrf_token;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let response,data;
    try{
      response=await fetch(path,{method,credentials:'same-origin',headers,signal:controller.signal,
        ...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
      data=await response.json().catch(()=>({error:'Не удалось прочитать ответ сервера.'}));
    }catch(error){
      if(error.name==='AbortError')throw new Error('Ответ сервера не получен за 20 секунд. Обновите данные перед повторной отправкой.');
      throw new Error('Нет связи с сервером. Проверьте соединение и обновите данные перед повторной отправкой.');
    }finally{clearTimeout(timer);}
    if(!response.ok) {
      if(response.status===401 && location.pathname.startsWith('/app')) location.assign('/login?returnTo='+encodeURIComponent(location.pathname+location.search));
      throw new Error(data.error||'Не удалось выполнить действие.');
    }
    return data;
  }
  function closeModal() {
    if(!$('.modal'))return;
    $('#modal-root').innerHTML='';
    document.body.style.overflow=previousOverflow;
    if(modalOpener?.isConnected){modalOpener.disabled=false;modalOpener.focus();}else{root.setAttribute('tabindex','-1');root.focus();}
    modalOpener=null;
  }
  function modal(title,body) {
    if(!$('.modal')){
      modalOpener=document.activeElement;previousOverflow=document.body.style.overflow;
      document.body.style.overflow='hidden';
    }
    $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${button('Закрыть','close','',true)}<h2 id="modal-title">${esc(title)}</h2>${body}</section></div>`;
    $('.modal').focus();
  }
  function table(headers,rows) {
    if(!rows.length) return empty('Подходящих записей пока нет.');
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function toolbar(action='',text='Добавить') {
    const statuses=['applications','reports'].includes(currentPage)?['new','review','interview','offer','hired','rejected','withdrawn']:currentPage==='plans'?['active','completed','overdue']:[];
    const users=currentPage==='users'?`<label>Роль<select id="record-role"><option value="">Все роли</option>${Object.entries(roleNames).map(([key,title])=>`<option value="${key}">${esc(title)}</option>`).join('')}</select></label><label>Доступ<select id="record-active"><option value="">Любой</option><option value="1">Активные</option><option value="0">Заблокированные</option></select></label>`:'';
    const sorting='<label>Порядок<select id="record-sort"><option value="default">Исходный</option><option value="name-asc">Название А–Я</option><option value="name-desc">Название Я–А</option><option value="date-desc">Сначала новые</option><option value="date-asc">Сначала ранние</option></select></label>';
    return `<div class="filters"><label>Поиск<input id="search" type="search" placeholder="Название, имя или подразделение"></label>${statuses.length?`<label>Состояние<select id="record-status"><option value="">Все состояния</option>${statuses.map(s=>`<option value="${s}">${s==='overdue'?'Есть просрочка':statusNames[s]}</option>`).join('')}</select></label>`:''}${users}${sorting}${action?button(text,action):''}</div><div id="records"></div>`;
  }
  function filterRecords(){
    recordPage=1;
    const query=($('#search')?.value||'').toLocaleLowerCase('ru');
    const status=$('#record-status')?.value||'';
    const role=$('#record-role')?.value||'',active=$('#record-active')?.value??'';
    const rows=currentRows.filter(row=>(!role||row.role_id===role)&&(active===''||String(row.active)===active)&&(!status||(status==='overdue'?row.status==='active'&&Number(row.overdue_count)>0:row.status===status))&&Object.values(row).some(value=>String(value??'').toLocaleLowerCase('ru').includes(query)));
    const order=$('#record-sort')?.value||'default';
    if(order!=='default'){
      const value=row=>order.startsWith('name')?row.title||row.full_name||row.candidate_name||row.original_name||row.action||row.key||'':row.created_at||row.scheduled_at||row.start_date||'';
      const collator=new Intl.Collator('ru',{numeric:true});
      rows.sort((a,b)=>(order.endsWith('desc')?-1:1)*collator.compare(String(value(a)),String(value(b))));
    }
    drawRecords(rows);
  }
  function privateNav() {
    if(!user) return;
    const candidate=['dashboard','profile','applications','interviews','plans','files','notifications'];
    const staff=['dashboard','requests','vacancies','applications','interviews','plans','competencies','reports','files','notifications','feedback'];
    const admin=['dashboard','users','departments','roles','audit','settings','requests','vacancies','applications','interviews','plans','reports','files','notifications','feedback','profile'];
    const pages=user.role_id==='candidate'?candidate:user.role_id==='admin'?admin:staff;
    $('#private-nav').innerHTML=`<hr class="nav-divider"><nav aria-label="Личный кабинет"><p class="nav-label">${esc(roleNames[user.role_id])}</p>${pages.map(p=>`<a class="nav-link${location.pathname===`/app/${p}`?' active':''}" href="/app/${p}">${esc(p==='applications'&&user.role_id==='candidate'?'Мои отклики':p==='plans'&&user.role_id==='candidate'?'Моя адаптация':privateLabels[p])}${p==='notifications'&&user.unread_count?` <span class="pill" aria-label="Непрочитанных: ${user.unread_count}">${user.unread_count}</span>`:''}</a>`).join('')}${button('Выйти','logout','',true)}</nav>`;
  }
  async function showLogin() {
    root.innerHTML=heading('Вход в личный кабинет','Выберите роль или введите данные демонстрационной учётной записи.')+
      `<div class="login-layout"><div>${form('login',input('Логин','username','text','',true,'autocomplete="username"')+input('Пароль','password','password','',true,'autocomplete="current-password"'),'Войти')}</div><section class="card"><h2>Проверить проект</h2><p class="small">Учётные записи используют пароль <strong>WitteDemo2026!</strong>. Набор создаётся один раз и сохраняет последующие изменения.</p>${[['candidate','Соискатель','Собственные отклики и встречи'],['hr','Служба персонала','Подбор, оценка и адаптация'],['admin','Администратор','Пользователи и журнал событий']].map(([role,title,text])=>`<div class="demo-option"><div><h3>${title}</h3><p class="small muted">${text}</p></div>${button('Войти','demo-login',role,true)}</div>`).join('')}</section></div>`;
  }
  async function showDashboard() {
    const data=await api('/api/dashboard');
    root.innerHTML=heading('Обзор кадрового процесса',`${roleNames[user.role_id]} · набор данных`)+
      `<div class="grid"><article class="card"><span class="small">${user.role_id==='candidate'?'Мои отклики':'Отклики в работе'}</span><span class="number">${data.applications}</span><a href="/app/applications">Открыть реестр</a></article><article class="card"><span class="small">Планы адаптации</span><span class="number">${data.plans}</span><a href="/app/plans">Посмотреть планы</a></article><article class="card"><span class="small">Просроченные задания</span><span class="number">${data.overdue}</span><span class="small">Контроль на текущую дату</span></article></div>`+
      `<div class="section-heading"><h2>Этапы рассмотрения</h2><span class="small muted">Фактическое состояние записей</span></div><section class="card">${Object.entries(statusNames).filter(([key])=>['new','review','interview','offer','hired','rejected'].includes(key)).map(([key,label])=>`<div class="bar-row"><span>${label}</span><progress max="${Math.max(data.applications,1)}" value="${data.statuses[key]||0}" aria-label="${label}"></progress><strong>${data.statuses[key]||0}</strong></div>`).join('')}</section>`+
      `<div class="section-heading"><h2>Последние отклики</h2><a href="/app/applications">Все отклики</a></div>`+
      table(['Кандидат','Вакансия','Этап'],data.recent.map(a=>[esc(a.candidate_name),esc(a.vacancy_title),pill(a.status)]))+
      '<h2>Задания с истёкшим сроком</h2>'+table(['Сотрудник','Задание','Срок','План'],data.overdue_tasks.map(t=>[esc(t.employee_name),esc(t.title),date(t.due_date),button('Открыть','plan',t.plan_id,true)]));
  }
  async function showPublicVacancies() {
    const {rows}=await api('/api/list/vacancies');
    currentRows=rows;
    root.innerHTML=heading('Вакансии','Подразделения, обязанности, требования и этапы отбора.')+
      `<div class="filters"><label>Поиск вакансии<input id="vacancy-search" type="search" placeholder="Должность или подразделение"></label><label>Подразделение<select id="vacancy-department"><option value="">Все подразделения</option>${[...new Map(rows.map(v=>[v.department_id,v.department_title])).entries()].map(([id,title])=>`<option value="${esc(id)}">${esc(title)}</option>`).join('')}</select></label></div><div id="vacancy-cards" class="grid two"></div>`;
    drawVacancies(rows);
  }
  function drawVacancies(rows) {
    $('#vacancy-cards').innerHTML=rows.length?rows.map(v=>`<article class="card"><span class="pill">Вакансия</span><h2>${esc(v.title)}</h2><p class="small muted">${esc(v.department_title)}</p><p>${esc(v.description)}</p><h3>Требования</h3><p>${esc(v.requirements)}</p><p class="small">${esc(v.schedule)}</p>${button('Откликнуться','apply',v.id)}</article>`).join(''):empty('По этому запросу вакансий нет.');
  }
  function filterPublicVacancies(){
    const query=($('#vacancy-search')?.value||'').toLocaleLowerCase('ru');
    const department=$('#vacancy-department')?.value||'';
    drawVacancies(currentRows.filter(row=>(!department||row.department_id===department)&&`${row.title} ${row.department_title}`.toLocaleLowerCase('ru').includes(query)));
  }
  async function showProfile() {
    const {profile}=await api('/api/profile');
    const {rows:sessions}=await api('/api/sessions');
    const filled=[Boolean(profile.education?.trim()),Boolean(profile.experience?.trim()),Boolean(profile.about?.trim()),profile.consent===1].filter(Boolean).length;
    root.innerHTML=heading('Мой профиль','Укажите образование, профессиональный опыт и сведения о себе.')+
      `<section class="card"><h2>Заполненность профиля: ${filled*25}%</h2><progress value="${filled}" max="4" aria-label="Заполненность профиля"></progress><p class="small">Для отклика обязательны образование и согласие. Опыт и сведения о себе помогут дополнить профиль.</p></section>`+
      form('profile',area('Образование','education',profile.education||'')+area('Профессиональный опыт','experience',profile.experience||'')+area('О себе','about',profile.about||'',false)+
        `<label class="checkbox-label"><input type="checkbox" name="consent" ${profile.consent?'checked':''}>Подтверждаю использование данных для демонстрации отклика</label>`,'Сохранить профиль')+
      '<h2>Активные сессии</h2>'+table(['Сессия','Действует до'],sessions.map(s=>[s.current_session?'Текущая':'Другой вход',date(s.expires_at)]))+
      (sessions.length>1?form('revoke-sessions','','Завершить другие сессии'):'');
  }
  async function showList(page) {
    currentPage=page;
    recordPage=1;
    const type=page==='reports'?'applications':page;
    const {rows}=await api(`/api/list/${type}`);
    currentRows=rows;
    const actions={vacancies:['new-vacancy','Создать вакансию'],requests:['new-request','Создать заявку'],plans:['new-plan','Создать план'],departments:['new-department','Добавить подразделение'],users:['new-user','Добавить запись']};
    const allow=user.role_id!=='candidate';
    const [action,label]=allow?(actions[page]||[]):[];
    const title=page==='applications'&&user.role_id==='candidate'?'Мои отклики':privateLabels[page];
    root.innerHTML=heading(title)+
      (page==='reports'?'<p class="lead">Реестр сформирован из текущих записей. Выгрузка сохраняет состояние на момент запроса.</p><div class="actions"><a class="button" href="/api/export/applications.xlsx">Скачать реестр XLSX</a></div>':'')+
      (page==='files'?'<p class="lead">Можно загрузить  PDF до 2 МБ. Доступ к файлу проверяется по владельцу записи.</p>'+form('upload','<label>PDF-файл<input type="file" name="file" accept="application/pdf,.pdf" required></label>','Загрузить документ'):'')+
      (page==='notifications'&&rows.some(n=>!n.read_at)?`<div class="actions">${button('Прочитать все','read-all-notices','',true)}</div>`:'')+toolbar(action,label);
    drawRecords(rows);
  }
  function drawRecords(rows) {
    currentView=rows;
    const totalRows=rows.length,totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
    recordPage=Math.min(Math.max(recordPage,1),totalPages);
    rows=rows.slice((recordPage-1)*pageSize,recordPage*pageSize);
    const isStaff=user.role_id!=='candidate';
    let headers=[];
    let cells=[];
    if(['applications','reports'].includes(currentPage)) {
      headers=['Кандидат','Вакансия','Этап','Дата','Действия'];
      cells=rows.map(a=>[esc(a.candidate_name),esc(a.vacancy_title),pill(a.status),date(a.created_at),button('Открыть','application',a.id,true)]);
    } else if(currentPage==='vacancies') {
      headers=['Вакансия','Подразделение','Статус','Дата','Действия'];
      cells=rows.map(v=>[esc(v.title),esc(v.department_title),pill(v.status),date(v.created_at),`<div class="actions">${button('Редактировать','edit-vacancy',v.id,true)}${button('Копировать','clone-vacancy',v.id,true)}${v.status==='draft'?button('Компетенции','vacancy-profile',v.id,true):''}</div>`]);
      if(user.role_id==='admin')cells=rows.map((v,i)=>[...cells[i],v.status==='draft'?`<label><input type="checkbox" name="bulk-vacancy" value="${esc(v.id)}"> Выбрать</label>`:'—']);
      if(user.role_id==='admin')headers.push('Массовое действие');
    } else if(currentPage==='requests') {
      headers=['Должность','Подразделение','Обоснование','Статус','Рассмотрение'];
      cells=rows.map(r=>[esc(r.title),esc(r.department_title),esc(r.justification),pill(r.status),r.status==='submitted'?`<div class="actions">${button('Согласовать','approve-request',r.id,true)}${button('Вернуть','return-request',r.id,true)}</div>`:'Решение зафиксировано']);
    } else if(currentPage==='plans') {
      headers=['План','Сотрудник','Период','Выполнено','Действия'];
      cells=rows.map(p=>[esc(p.title),esc(p.employee_name),`${date(p.start_date)} — ${date(p.end_date)}`,`${p.done_count} из ${p.task_count}`,button('Открыть','plan',p.id,true)]);
    } else if(currentPage==='interviews') {
      headers=['Соискатель','Вакансия','Дата и время','Формат','Статус','Действия'];
      cells=rows.map(i=>[esc(i.candidate_name),esc(i.vacancy_title),date(i.scheduled_at),esc(i.format),pill(i.status),isStaff&&i.status==='planned'?button('Зафиксировать итог','interview-result',i.id,true):esc(i.result||'—')]);
    } else if(currentPage==='competencies') {
      headers=['Компетенция','Наблюдаемый результат','Вес'];
      cells=rows.map(c=>[esc(c.title),esc(c.description),esc(c.weight)]);
    } else if(currentPage==='files') {
      headers=['Документ','Размер','Дата загрузки','Скачать'];
      cells=rows.map(f=>[esc(f.original_name),`${Math.ceil(f.size_bytes/1024)} КБ`,date(f.created_at),`<a href="/api/files/${encodeURIComponent(f.id)}">Скачать PDF</a>`]);
    } else if(currentPage==='notifications') {
      headers=['Уведомление','Сообщение','Дата','Прочитано'];
      cells=rows.map(n=>[esc(n.title),esc(n.body),date(n.created_at),n.read_at?'Да':button('Отметить','read-notice',n.id,true)]);
    } else if(currentPage==='users') {
      headers=['Имя','Логин','Роль','Подразделение','Состояние','Действие'];
      cells=rows.map(u=>[esc(u.full_name),esc(u.username),esc(roleNames[u.role_id]),esc(u.department_title||'Не назначено'),u.active?'Активна':'Заблокирована',`<div class="actions">${button('Подразделение','user-department',u.id,true)}${u.id===user.id?'Текущая запись':button(u.active?'Заблокировать':'Разблокировать','toggle-user',u.id,true)}</div>`]);
    } else if(currentPage==='departments') {
      headers=['Подразделение','Назначение','Действия'];
      cells=rows.map(d=>[esc(d.title),esc(d.description),button('Редактировать','edit-department',d.id,true)]);
    } else if(currentPage==='roles') {
      headers=['Роль','Назначение','Записей'];
      const purpose={admin:'Пользователи, подразделения, роли, журнал и настройки',hr:'Подбор, оценка, встречи, адаптация и отчёты',candidate:'Собственный профиль, отклики, встречи, план и документы'};
      cells=rows.map(r=>[esc(r.title),esc(purpose[r.id]||''),esc(r.user_count)]);
    } else if(currentPage==='audit') {
      headers=['Дата','Пользователь','Действие','Объект','Подробности'];
      cells=rows.map(a=>[date(a.created_at),esc(a.actor_name||'Система'),esc(a.action),esc(a.entity_type),esc(a.details)]);
    } else if(currentPage==='feedback') {
      headers=['Имя','Контакт','Тема','Сообщение','Дата'];
      cells=rows.map(f=>[esc(f.name),esc(f.contact),esc(f.topic),esc(f.message),date(f.created_at)]);
    }
    $('#records').innerHTML=table(headers,cells)+`<nav class="actions" aria-label="Страницы реестра"><span role="status">Записей: ${totalRows}. Страница ${recordPage} из ${totalPages}</span>${recordPage>1?button('Назад','records-prev','',true):''}${recordPage<totalPages?button('Далее','records-next','',true):''}</nav>`+(currentPage==='vacancies'&&user.role_id==='admin'?`<div class="actions">${button('Опубликовать выбранные черновики','bulk-publish','',true)}</div>`:'');
  }
  async function applicationModal(id) {
    const {application:a,assessments,history}=await api(`/api/applications/${encodeURIComponent(id)}`);
    assessmentRevisions=assessments;
    const transitions={new:['review','rejected'],review:['interview','rejected'],interview:['offer','rejected'],offer:['hired','rejected']};
    let body=`<p><strong>${esc(a.candidate_name)}</strong><br>${esc(a.vacancy_title)}</p><p>${pill(a.status)}</p><p>${esc(a.cover_letter)}</p>`;
    if(a.decision_note) body+=`<p><strong>Обоснование решения:</strong> ${esc(a.decision_note)}</p>`;
    if(user.role_id==='candidate'&&a.status==='new')body+='<h3>Изменить сопроводительное сообщение</h3>'+form('application-letter',`<input type="hidden" name="version" value="${a.version}">`+area('Сопроводительное сообщение','cover_letter',a.cover_letter),'Сохранить сообщение',id);
    if(user.role_id==='candidate'&&['new','review','interview','offer'].includes(a.status))body+=`<div class="actions">${button('Отозвать отклик','withdraw',a.id,true)}</div>`;
    if(user.role_id!=='candidate') {
      body+=`<h3>Оценка компетенций</h3>`+table(['Компетенция','Оценка','Основание'],assessments.map(s=>[esc(s.title),s.score??'Не заполнена',esc(s.evidence||'')]))+
        form('assessment',`<input type="hidden" name="application_id" value="${esc(id)}"><input type="hidden" name="expected_at" value="${esc(assessments[0]?.assessment_updated_at||'')}">`+select('Компетенция','competency_id',assessments.map(s=>[s.id,s.title]))+input('Оценка от 0 до 5','score','number',assessments[0]?.score??3,true,'min="0" max="5" step="1"')+area('Наблюдаемый результат задания','evidence',assessments[0]?.evidence||''),'Сохранить оценку');
      if(transitions[a.status]?.length) body+=`<h3>Изменить этап</h3>`+form('application-status',`<input type="hidden" name="version" value="${a.version}">`+select('Следующий этап','status',transitions[a.status].map(s=>[s,statusNames[s]]))+area('Обоснование решения','decision_note','',false),'Сохранить решение',id);
      if(['review','interview'].includes(a.status)) body+=`<h3>Назначить собеседование</h3>`+form('interview',`<input type="hidden" name="application_id" value="${esc(id)}">`+input('Дата и время UTC, резервируется один час','scheduled_at','datetime-local')+input('Формат и место','format','text','Видеовстреча'),'Назначить встречу');
    }
    body+='<h3>История отклика</h3>'+table(['Дата','Действие','Подробности'],history.map(event=>[date(event.created_at),esc(event.action),esc(event.details)]));
    modal('Карточка отклика',body);
  }
  async function planModal(id) {
    const {plan,tasks}=await api(`/api/plans/${encodeURIComponent(id)}`);
    let body=`<p>${esc(plan.title)}</p><p>${date(plan.start_date)} — ${date(plan.end_date)} · ${pill(plan.status)}</p><div class="actions"><a class="button secondary" href="/api/export/plan/${encodeURIComponent(id)}">Скачать план DOCX</a></div>`+
      table(['Задание','Срок','Статус','Подтверждение','Действия'],tasks.map(t=>[esc(t.title),date(t.due_date),pill(t.status),esc(t.evidence),user.role_id!=='candidate'&&t.status==='todo'&&plan.status==='active'?button('Подтвердить','complete-task',t.id,true):'—']));
    if(user.role_id!=='candidate'&&plan.status==='active') body+=`<h3>Добавить задание</h3>`+form('task',input('Содержание задания','title')+input('Срок','due_date','date'),'Добавить',id)+`<div class="actions">${button('Завершить план','complete-plan',id,true)}</div>`;
    modal('План адаптации',body);
  }
  async function newVacancy() {
    const departments=(await api('/api/list/departments')).rows;
    const requests=(await api('/api/list/requests')).rows.filter(r=>r.status==='approved');
    modal('Новая вакансия',form('vacancy',input('Название должности','title')+
      select('Подразделение','department_id',departments.map(d=>[d.id,d.title]))+
      select('Согласованная заявка','request_id',[['','Вакансия без связанной заявки'],...requests.map(r=>[r.id,r.title])])+
      area('Обязанности','description')+area('Требования','requirements')+input('График','schedule','text','Полная занятость')+
      select('Публикация','status',[['published','Опубликовать'],['draft','Сохранить черновик']]),'Создать вакансию'));
    $('select[name=request_id]').required=false;
  }
  async function newRequest() {
    const departments=(await api('/api/list/departments')).rows;
    modal('Заявка на подбор',form('request',input('Должность','title')+select('Подразделение','department_id',departments.map(d=>[d.id,d.title]))+area('Обоснование потребности','justification'),'Передать на согласование'));
  }
  async function newPlan() {
    const apps=(await api('/api/list/applications')).rows.filter(a=>a.status==='hired');
    if(!apps.length) return toast('Сначала завершите приём сотрудника в реестре откликов.',true);
    const today=new Date().toISOString().slice(0,10);
    const end=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    modal('Новый план адаптации',form('plan',select('Принятый сотрудник','application_id',apps.map(a=>[a.id,`${a.candidate_name} · ${a.vacancy_title}`]))+input('Название плана','title','text','Первые 30 дней нового сотрудника')+input('Начало','start_date','date',today)+input('Окончание','end_date','date',end),'Создать план'));
  }
  function showContact() {
    root.innerHTML=heading('Обратная связь по проекту','Отправьте вопрос или предложение по работе сервиса.')+
      form('feedback',input('Имя','name')+input('Условный контакт','contact','text','example@test.invalid')+input('Тема','topic')+area('Сообщение','message')+
        '<label class="checkbox-label"><input type="checkbox" name="consent" required>Использую вымышленные сведения и согласен сохранить сообщение в проекте</label>','Отправить сообщение');
  }
  async function showSettings() {
    const {rows}=await api('/api/list/settings');
    const note=rows.find(r=>r.key==='project_note')?.value||'Демонстрационный набор кадрового процесса';
    root.innerHTML=heading('Настройки системы')+form('settings',area('Примечание к проекту','value',note),'Сохранить примечание')+
      '<article class="article"><h2>Работа с доступом</h2><p>Изменения пользователей фиксируются в журнале событий. Блокировка учётной записи завершает её активные сессии.</p><a href="/app/users">Открыть пользователей</a></article>';
  }
  async function loadPage() {
    const path=location.pathname;
    if(path==='/login') return showLogin();
    if(path==='/p/vacancies') return showPublicVacancies();
    if(path==='/p/contact') return showContact();
    if(path.startsWith('/app/')) {
      if(!user) { location.replace('/login?returnTo='+encodeURIComponent(path+location.search)); return; }
      const page=path.split('/')[2]||'dashboard';
      const crumb=$('.breadcrumbs span');
      if(crumb) crumb.textContent=privateLabels[page]||'Кабинет';
      if(page==='dashboard') return showDashboard();
      if(page==='profile') return showProfile();
      if(page==='settings') return showSettings();
      return showList(page);
    }
  }
  document.addEventListener('input',event=>{
    if(event.target.id==='search') {
      filterRecords();
    }
    if(event.target.id==='vacancy-search') {
      filterPublicVacancies();
    }
  });
  document.addEventListener('change',event=>{if(event.target.id==='vacancy-department')filterPublicVacancies();if(['record-status','record-role','record-active','record-sort'].includes(event.target.id))filterRecords();});
  document.addEventListener('change',event=>{
    if(event.target.name!=='competency_id'||!event.target.closest('[data-form=assessment]'))return;
    const row=assessmentRevisions.find(s=>s.id===event.target.value),form=event.target.form;
    form.elements.expected_at.value=row?.assessment_updated_at||'';form.elements.score.value=row?.score??3;form.elements.evidence.value=row?.evidence||'';
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape') closeModal();
    if(event.key==='Tab'&&$('.modal')) {
      const fields=[...$('.modal').querySelectorAll('button,input,textarea,select,a[href]')].filter(el=>!el.disabled);
      const first=fields[0],last=fields[fields.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  document.addEventListener('click',async event=>{
    if(event.target.id==='mobile-nav') {
      const open=$('#sidebar').classList.toggle('open');
      event.target.setAttribute('aria-expanded',String(open));
      event.target.textContent=open?'Закрыть меню':'Открыть меню';
      return;
    }
    const target=event.target.closest('[data-action]');
    if(!target) return;
    const {action,id}=target.dataset;
    target.disabled=true;
    try {
      if(action==='close') closeModal();
      else if(action==='records-prev'||action==='records-next'){recordPage+=action==='records-next'?1:-1;drawRecords(currentView);$('#records').scrollIntoView({block:'start',behavior:'smooth'});}
      else if(action==='demo-login') {
        await api('/api/demo/start','POST',{});
        await api('/api/login','POST',{username:id,password:'WitteDemo2026!'});
        location.assign(safeReturnPath(new URLSearchParams(location.search).get('returnTo')));
      } else if(action==='logout') {
        await api('/api/logout','POST',{});
        location.assign('/');
      } else if(action==='application') await applicationModal(id);
      else if(action==='plan') await planModal(id);
      else if(action==='new-vacancy') await newVacancy();
      else if(action==='new-request') await newRequest();
      else if(action==='new-plan') await newPlan();
      else if(action==='user-department'){
        const row=currentRows.find(u=>u.id===id),departments=(await api('/api/list/departments')).rows;
        modal('Подразделение пользователя',form('user-department',select('Подразделение','department_id',[['','Без подразделения'],...departments.map(d=>[d.id,d.title])],row.department_id||''),'Сохранить',id));
        $('.modal select').required=false;
      }
      else if(action==='clone-vacancy'){await api(`/api/clone-vacancy/${encodeURIComponent(id)}`,'POST',{});toast('Создан новый черновик вакансии.');await showList('vacancies');}
      else if(action==='vacancy-profile'){
        const vacancy=currentRows.find(v=>v.id===id),competencies=(await api('/api/list/competencies')).rows;
        const selected=(await api(`/api/vacancy-profile/${encodeURIComponent(id)}`)).rows;
        modal('Профиль компетенций вакансии',form('vacancy-profile',`<input type="hidden" name="version" value="${vacancy.version}"><p>Укажите целевой уровень от 1 до 5. Значение 0 исключает компетенцию. Для вакансии с откликами используйте копирование.</p>`+competencies.map(c=>input(c.title,'level_'+c.id,'number',selected.find(s=>s.competency_id===c.id)?.target_level||0,true,'min="0" max="5" step="1"')).join(''),'Сохранить',id));
      }
      else if(action==='new-user') modal('Новая запись',form('new-user',input('ФИО пользователя','full_name')+input('Логин','username')+select('Роль','role_id',[['candidate','Соискатель / сотрудник'],['hr','Специалист службы персонала']])+input('Пароль, от 12 символов','password','password','','true','autocomplete="new-password" minlength="12"'),'Создать'));
      else if(action==='edit-vacancy') {
        const vacancy=currentRows.find(v=>v.id===id);
        modal('Редактирование вакансии',form('edit-vacancy',`<input type="hidden" name="version" value="${vacancy.version}">`+input('Должность','title','text',vacancy.title)+area('Обязанности','description',vacancy.description)+area('Требования','requirements',vacancy.requirements)+select('Статус','status',[['draft','Черновик'],['published','Опубликована'],['closed','Закрыта']],vacancy.status),'Сохранить',id));
      } else if(action==='interview-result') modal('Итог собеседования',form('interview-result',select('Статус','status',[['completed','Завершено'],['cancelled','Отменено']])+area('Итог встречи или причина отмены','result'),'Сохранить',id));
      else if(action==='read-notice'||action==='read-all-notices') {
        await api(action==='read-notice'?`/api/read-notice/${encodeURIComponent(id)}`:'/api/notices/read-all','POST',{});
        user=(await api('/api/me')).user;privateNav();await showList('notifications');
      }
      else if(action==='withdraw') modal('Отзыв отклика',`<p>Отклик будет отозван, запланированные встречи отменены. Повторный отклик на ту же вакансию не создаётся.</p>`+form('withdraw','','Отозвать отклик',id));
      else if(action==='bulk-publish') {
        const ids=[...document.querySelectorAll('[name=bulk-vacancy]:checked')].map(input=>input.value);
        const result=await api('/api/admin/publish-vacancies','POST',{ids});
        toast(`Опубликовано вакансий: ${result.published}.`);await showList('vacancies');
      }
      else if(action==='new-department') modal('Добавить подразделение',form('department',input('Название','title')+area('Назначение','description'),'Добавить'));
      else if(action==='edit-department'){
        const row=currentRows.find(d=>d.id===id);
        modal('Изменить подразделение',form('edit-department',input('Название','title','text',row.title)+area('Назначение','description',row.description,false),'Сохранить',id));
      }
      else if(action==='apply') {
        if(!user){location.assign('/login?returnTo='+encodeURIComponent(location.pathname));return;}
        if(user.role_id!=='candidate'){toast('Отклик доступен в роли соискателя.',true);return;}
        modal('Отправить отклик',form('apply',area('Сопроводительное сообщение','cover_letter'),'Отправить отклик',id));
      } else if(action==='complete-task') {
        modal('Подтвердить выполнение',form('complete-task',area('Результат и подтверждение','evidence'),'Подтвердить',id));
      } else if(action==='complete-plan') {
        await api(`/api/plans/${encodeURIComponent(id)}`,'POST',{action:'complete'});
        toast('План завершён.');await planModal(id);
      } else if(['approve-request','return-request'].includes(action)) {
        await api(`/api/requests/${encodeURIComponent(id)}`,'POST',{status:action==='approve-request'?'approved':'returned'});
        toast('Решение по заявке сохранено.');await showList('requests');
      } else if(action==='toggle-user') {
        const row=currentRows.find(r=>r.id===id);
        modal(row.active?'Блокировка пользователя':'Разблокировка пользователя',`<p>${esc(row.full_name)}</p><p>${row.active?'Активные сессии этой записи будут завершены.':'Пользователь снова сможет войти в приложение.'}</p>`+form('toggle-user',`<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="active" value="${row.active?'false':'true'}">`,'Подтвердить'));
      }
    } catch(error){toast(error.message,true);}
    finally{if(target.isConnected)target.disabled=false;}
  });
  document.addEventListener('submit',async event=>{
    const formElement=event.target.closest('form[data-form]');
    if(!formElement)return;
    event.preventDefault();
    if(formElement.dataset.pending==='true')return;
    formElement.dataset.pending='true';formElement.setAttribute('aria-busy','true');
    const inlineError=formElement.querySelector('.form-error');
    inlineError.hidden=true;inlineError.textContent='';
    const submit=formElement.querySelector('button[type=submit]');
    submit.disabled=true;
    const raw=new FormData(formElement);
    const data=Object.fromEntries(raw.entries());
    if(formElement.querySelector('[name=consent]'))data.consent=formElement.querySelector('[name=consent]').checked;
    const id=formElement.dataset.id;
    const action=formElement.dataset.form;
    try {
      if(action==='login') {
        await api('/api/login','POST',data);location.assign(safeReturnPath(new URLSearchParams(location.search).get('returnTo')));return;
      }
      if(action==='profile')await api('/api/profile','POST',data);
      else if(action==='revoke-sessions'){await api('/api/sessions/revoke-others','POST',{});await showProfile();}
      else if(action==='apply'){await api('/api/applications','POST',{...data,vacancy_id:id});closeModal();}
      else if(action==='application-letter'){await api(`/api/application-letter/${encodeURIComponent(id)}`,'POST',data);await applicationModal(id);}
      else if(action==='vacancy'){await api('/api/vacancies','POST',data);closeModal();await showList('vacancies');}
      else if(action==='vacancy-profile'){
        const items=Object.entries(data).filter(([key,value])=>key.startsWith('level_')&&Number(value)>0).map(([key,value])=>({competency_id:key.slice(6),target_level:Number(value)}));
        await api(`/api/vacancy-competencies/${encodeURIComponent(id)}`,'POST',{version:data.version,items});closeModal();await showList('vacancies');
      }
      else if(action==='request'){await api('/api/requests','POST',data);closeModal();await showList('requests');}
      else if(action==='assessment'){await api('/api/assessments','POST',data);await applicationModal(data.application_id);}
      else if(action==='application-status'){await api(`/api/applications/${encodeURIComponent(id)}`,'POST',data);await applicationModal(id);}
      else if(action==='interview'){await api('/api/interviews','POST',data);closeModal();await loadPage();}
      else if(action==='plan'){await api('/api/plans','POST',data);closeModal();await showList('plans');}
      else if(action==='task'){await api(`/api/plans/${encodeURIComponent(id)}`,'POST',data);await planModal(id);}
      else if(action==='complete-task'){await api(`/api/tasks/${encodeURIComponent(id)}`,'POST',data);closeModal();await loadPage();}
      else if(action==='upload'){await api('/api/files','POST',raw);await showList('files');}
      else if(action==='feedback'){await api('/api/feedback','POST',data);formElement.reset();}
      else if(action==='settings')await api('/api/admin/settings','POST',data);
      else if(action==='department'){await api('/api/admin/departments','POST',data);closeModal();await showList('departments');}
      else if(action==='edit-department'){await api('/api/admin/edit-department','POST',{...data,id});closeModal();await showList('departments');}
      else if(action==='toggle-user'){await api('/api/admin/users','POST',{id:data.id,active:data.active==='true'});closeModal();await showList('users');}
      else if(action==='new-user'){await api('/api/admin/create-user','POST',data);closeModal();await showList('users');}
      else if(action==='user-department'){await api('/api/admin/user-department','POST',{...data,id});closeModal();await showList('users');}
      else if(action==='edit-vacancy'){await api(`/api/vacancy/${encodeURIComponent(id)}`,'POST',data);closeModal();await showList('vacancies');}
      else if(action==='interview-result'){await api(`/api/interview/${encodeURIComponent(id)}`,'POST',data);closeModal();await showList('interviews');}
      else if(action==='withdraw'){await api(`/api/withdraw/${encodeURIComponent(id)}`,'POST',{});closeModal();await showList('applications');}
      toast(action==='feedback'?'Сообщение сохранено в проекте.':'Изменения сохранены.');
    }catch(error){
      if(formElement.isConnected){inlineError.hidden=false;inlineError.textContent=error.message;inlineError.focus();}
      else toast(error.message,true);
    }
    finally{delete formElement.dataset.pending;formElement.removeAttribute('aria-busy');if(submit.isConnected)submit.disabled=false;}
  });
  async function start() {
    try {
      const data=await api('/api/me');
      user=data.user;
      if(user){$('#account-label').textContent=user.full_name;$('#account-link').textContent='Личный кабинет';$('#account-link').href='/app/dashboard';privateNav();}
      await loadPage();
      if(user?.expires_at&&location.pathname.startsWith('/app/'))setTimeout(()=>{
        const warning=document.createElement('p');warning.className='notice';warning.setAttribute('role','status');
        warning.textContent='Сессия скоро закончится. Сохраните форму и войдите снова.';
        root.prepend(warning);
      },Math.max(0,Date.parse(user.expires_at)-Date.now()-5*60000));
    }catch(error){
      if(location.pathname==='/login'){await showLogin();toast(error.message,true);}
      else if(location.pathname.startsWith('/app')||location.pathname==='/p/vacancies')root.innerHTML=heading('Не удалось загрузить раздел')+`<p>${esc(error.message)}</p><a href="${esc(location.pathname)}">Попробовать снова</a>`;
    }
  }
  start();
}

export const CLIENT = `(${clientBootstrap.toString()})(${safeReturnPath.toString()});`;
