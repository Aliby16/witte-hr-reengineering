import { htmlEscape } from './security.js';
import { PUBLIC_PAGES, publicArticle } from './public.js';

export function renderShell(pathname, user = null, errorMessage = '') {
  const page = pathname === '/' ? 'home' : pathname.split('/')[2] || 'dashboard';
  const isPublic = pathname === '/' || pathname.startsWith('/p/');
  const pageTitle = PUBLIC_PAGES[page]?.[1] || (pathname === '/login' ? 'Вход в личный кабинет' : 'Рабочее пространство');
  const nav = Object.entries(PUBLIC_PAGES).map(([id,[label]]) => {
    const path = id === 'home' ? '/' : `/p/${id}`;
    return `<a class="nav-link${isPublic && page === id ? ' active' : ''}" href="${path}">${htmlEscape(label)}</a>`;
  }).join('');
  const content = errorMessage ? `<h1>Раздел недоступен</h1><p>${htmlEscape(errorMessage)}</p><a class="button" href="/app/dashboard">Вернуться в кабинет</a>` :
    pathname === '/' ? `
      <div class="eyebrow">Преддипломная практика · Бизнес-информатика</div>
      <section class="hero">
        <div class="hero-rule"></div>
        <h1>От заявки на подбор<br>до завершения адаптации</h1>
        <p class="lead">Единое пространство для соискателя и службы персонала. Отклики, оценка компетенций и первые задачи нового сотрудника связаны в одном процессе.</p>
        <div class="actions"><a class="button" href="/p/vacancies">Посмотреть вакансии</a><a class="button secondary" href="/login">Открыть кабинет</a></div>
      </section>
      <div class="section-heading"><h2>Последовательность работы</h2><a href="/p/process">Все этапы отбора</a></div>
      <div class="grid">
        <article class="card"><span class="step-number">01</span><h3>Подать отклик</h3><p>Заполнить профиль и выбрать вакансию. Изменение статуса появится в личном кабинете.</p></article>
        <article class="card"><span class="step-number">02</span><h3>Проверить компетенции</h3><p>Зафиксировать результаты практических заданий и обоснование кадрового решения.</p></article>
        <article class="card"><span class="step-number">03</span><h3>Пройти адаптацию</h3><p>Получить план с наставником, сроками и подтверждением выполнения каждого задания.</p></article>
      </div>
      <div class="section-heading"><h2>Рабочие пространства</h2><span class="small muted">Три роли с разными правами</span></div>
      <div class="grid"><article class="card"><h3>Соискателю</h3><p>Профиль, отклики, встречи и личный план адаптации.</p><a href="/login">Перейти в кабинет</a></article><article class="card"><h3>Службе персонала</h3><p>Заявки, воронка подбора, оценочные листы и отчёты.</p><a href="/login">Открыть рабочее место</a></article><article class="card"><h3>Администратору</h3><p>Пользователи, справочники и журнал изменений.</p><a href="/login">Управление сервисом</a></article></div>` :
    isPublic && !['vacancies','contact'].includes(page) ? `<h1>${htmlEscape(pageTitle)}</h1>${publicArticle(page)}` :
    `<h1>${htmlEscape(pageTitle)}</h1><div class="loading" role="status">Загружаем раздел…</div>`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Кадровые процессы МУИВ: подбор, оценка и адаптация сотрудников">
<title>${htmlEscape(pageTitle)} · Кадровые процессы МУИВ</title>
<link rel="stylesheet" href="/assets/styles.css">
<script src="/assets/client.js" defer></script>
</head>
<body data-path="${htmlEscape(pathname)}">
<a class="skip" href="#main">Перейти к содержанию</a>
<header class="masthead"><div class="topline">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true">В</span><span><strong>Кадровые процессы</strong><small>Московский университет им. С.Ю. Витте</small></span></a>
<div class="top-actions"><span class="project-label">Служба персонала</span><span id="account-label" class="account-label">${user ? htmlEscape(user.full_name) : ''}</span><a id="account-link" href="${user ? '/app/dashboard' : '/login'}">${user ? 'Личный кабинет' : 'Войти'}</a></div>
</div></header>
<button class="mobile-nav" id="mobile-nav" aria-expanded="false" aria-controls="sidebar">Открыть меню</button>
<div class="layout">
<aside class="sidebar" id="sidebar"><nav aria-label="Главное меню"><p class="nav-label">Открытые разделы</p>${nav}</nav><div id="private-nav"></div><p class="sidebar-note">Подбор, оценка компетенций и сопровождение адаптации сотрудников.</p></aside>
<main class="content" id="main" tabindex="-1"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span>${pathname === '/' ? 'Обзор проекта' : htmlEscape(isPublic ? PUBLIC_PAGES[page]?.[0] || pageTitle : pageTitle)}</span></nav><div id="page-content">${content}</div></main>
</div>
<footer><div class="footer-inner"><span>Автор: Бисенкулова Алина Владиславовна · о.ИЗДт 30.3/Б3-22</span><span>Кадровые процессы МУИВ · 2026</span></div></footer>
<div class="toast-stack" id="toasts" aria-live="polite"></div>
<div id="modal-root"></div>
</body></html>`;
}
