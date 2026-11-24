export const STYLES = String.raw`
:root {
  --ink: #172b3b;
  --muted: #566778;
  --brand: #164d66;
  --brand-dark: #10394e;
  --accent: #b66c28;
  --paper: #ffffff;
  --background: #f3f6f8;
  --line: #d7e1e7;
  --soft: #e8f1f5;
  --success: #23684d;
  --danger: #a23436;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  color: var(--ink);
  background: var(--background);
  font-size: 16px;
  line-height: 1.55;
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: var(--brand); text-underline-offset: 3px; }
button, input, select, textarea { font: inherit; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
button, .button { cursor: pointer; }
button, .button {
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid var(--brand);
  background: var(--brand);
  color: white;
  padding: .7rem 1.15rem;
  border-radius: .45rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  text-decoration: none;
  font-weight: 600;
  min-height: 44px;
}
button:hover, .button:hover { background: var(--brand-dark); }
button:disabled { opacity: .55; cursor: wait; }
.secondary { background: white; color: var(--brand); border-color: var(--line); }
.secondary:hover { background: var(--soft); }
.danger { background: var(--danger); border-color: var(--danger); }
:focus-visible { outline: 3px solid #dca558; outline-offset: 3px; }
.skip { position: absolute; left: -10000px; top: 12px; z-index: 9; }
.skip:focus { left: 12px; background: white; padding: 12px; }
.masthead { background: var(--brand-dark); color: white; }
.topline { max-width: 1440px; margin: auto; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.brand { color: white; text-decoration: none; display: flex; align-items: center; gap: 1rem; }
.brand-mark { width: 46px; height: 46px; border: 1px solid #8ab0c3; border-radius: 8px; display: grid; place-items: center; font-family: Georgia, serif; font-size: 1.55rem; }
.brand strong { display: block; letter-spacing: .02em; font-size: 1.1rem; }
.brand small { display: block; color: #ccdde6; font-size: .875rem; }
.top-actions { display: flex; align-items: center; gap: 1rem; }
.top-actions a { color: white; }
.project-label { font-size: .875rem; color: #d8e4eb; border: 1px solid #668b9e; padding: .25rem .6rem; border-radius: 20px; white-space: nowrap; }
.account-label { color: #d8e4eb; font-size: .875rem; }
.layout { max-width: 1440px; margin: auto; display: grid; grid-template-columns: 244px minmax(0,1fr); min-height: calc(100vh - 165px); }
.sidebar { background: white; border-right: 1px solid var(--line); padding: 1.6rem 1rem; }
.nav-label { margin: .4rem .65rem .8rem; color: var(--muted); font-size: .875rem; font-weight: 600; }
.nav-link { display: block; border-radius: .4rem; padding: .65rem .8rem; margin: .1rem 0; text-decoration: none; color: #334c5e; font-size: .9375rem; }
.nav-link:hover { background: #f0f5f7; }
.nav-link.active { color: var(--brand); background: var(--soft); font-weight: 650; box-shadow: inset 3px 0 var(--brand); }
.nav-divider { border: 0; border-top: 1px solid var(--line); margin: 1.3rem .6rem; }
.sidebar-note { color: var(--muted); font-size: .875rem; margin: 1.5rem .75rem 0; }
.content { padding: 1.8rem 2.4rem 3rem; min-width: 0; }
.breadcrumbs { color: var(--muted); display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .875rem; margin-bottom: 1.25rem; }
.breadcrumbs a { color: var(--muted); }
.breadcrumbs span+span::before { content: '/'; padding-right: .5rem; color: #8799a7; }
.eyebrow { color: var(--accent); font-size: .875rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; font-size: clamp(1.8rem,3vw,2.8rem); line-height: 1.16; margin: .45rem 0 .9rem; letter-spacing: -.025em; }
h2 { font-size: 1.2rem; line-height: 1.35; margin: 0 0 .65rem; font-weight: 650; }
h3 { font-size: 1rem; line-height: 1.4; margin: .4rem 0; }
p { margin: .4rem 0 1rem; }
.lead { color: var(--muted); max-width: 760px; font-size: 1.05rem; }
.hero { background: white; border: 1px solid var(--line); border-radius: .65rem; padding: 2.3rem; margin: 1.4rem 0 1.8rem; position: relative; overflow: hidden; }
.hero h1 { max-width: 670px; }
.hero p { max-width: 660px; }
.hero .actions { margin-top: 1.5rem; }
.hero-rule { width: 65px; height: 4px; background: var(--accent); margin-bottom: 1.4rem; }
.actions { display: flex; flex-wrap: wrap; gap: .7rem; align-items: center; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 1.8rem 0 1rem; }
.grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; }
.grid.two { grid-template-columns: repeat(2,minmax(0,1fr)); }
.card { background: white; border: 1px solid var(--line); border-radius: .55rem; padding: 1.35rem; min-width: 0; }
.card p { color: var(--muted); font-size: .9375rem; }
.card .number { display: block; font-family: Georgia,serif; font-size: 2.1rem; line-height: 1.2; margin: .25rem 0; color: var(--brand); }
.card .small { color: var(--muted); font-size: .875rem; }
.step-number { color: var(--accent); font-family: Georgia,serif; font-size: 1.45rem; }
.article { background: white; border: 1px solid var(--line); border-radius: .45rem; padding: 1.3rem 1.5rem; margin: 1rem 0; }
.article p { margin-bottom: 0; max-width: 850px; }
.pill { display: inline-block; font-size: .875rem; padding: .2rem .65rem; border-radius: 99px; color: var(--brand); background: var(--soft); font-weight: 550; white-space: nowrap; }
.pill.success { color: var(--success); background: #e7f3ec; }
.pill.warning { color: #875216; background: #fbf0df; }
.pill.error { color: #9c3535; background: #faebeb; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.table-wrap { overflow-x: auto; background: white; border: 1px solid var(--line); border-radius: .5rem; }
table { border-collapse: collapse; width: 100%; font-size: .9375rem; }
th { text-align: left; font-weight: 600; background: #edf3f6; color: #395164; white-space: nowrap; }
th, td { padding: .85rem 1rem; border-bottom: 1px solid var(--line); vertical-align: top; }
tbody tr:last-child td { border-bottom: 0; }
td { max-width: 340px; overflow-wrap: anywhere; }
td .button, td button { padding: .4rem .65rem; min-height: 38px; font-size: .875rem; }
.filters { display: flex; gap: .8rem; flex-wrap: wrap; margin: 1rem 0; align-items: end; }
.filters label { flex: 1; min-width: 170px; max-width: 340px; }
label { display: block; color: #314b5d; font-size: .9375rem; font-weight: 550; }
input, select, textarea { width: 100%; border: 1px solid #aebfca; border-radius: .35rem; padding: .65rem .75rem; background: white; color: var(--ink); min-height: 44px; margin-top: .35rem; }
input[type=checkbox] { width: 20px; min-height: 20px; margin: 0; }
select { padding-right: 2rem; }
textarea { min-height: 110px; resize: vertical; }
.form { background: white; border: 1px solid var(--line); padding: 1.4rem; border-radius: .5rem; max-width: 800px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.form-grid .full { grid-column: 1/-1; }
.form label { margin-bottom: 1rem; }
.form .actions { margin-top: .8rem; }
.checkbox-label { display: flex; align-items: start; gap: .65rem; font-weight: 400; }
.hint { display: block; color: var(--muted); font-weight: 400; font-size: .875rem; margin-top: .3rem; }
.empty { padding: 2.3rem; text-align: center; color: var(--muted); background: white; border: 1px dashed #b5c6d1; border-radius: .5rem; }
.notice { padding: .8rem 1rem; border-left: 3px solid var(--accent); background: #fff8ee; margin: 1rem 0; font-size: .9375rem; }
.login-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 1.5rem; margin-top: 1.5rem; }
.demo-option { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border-bottom: 1px solid var(--line); padding: .9rem 0; }
.demo-option:last-child { border-bottom: 0; }
.demo-option p { margin: .25rem 0 0; }
.progress { height: 8px; background: #e5edf1; border-radius: 9px; overflow: hidden; margin: .8rem 0; }
.progress-fill { height: 100%; background: var(--brand); }
.toast-stack { position: fixed; right: 1.2rem; bottom: 1.2rem; display: grid; gap: .7rem; z-index: 20; max-width: min(420px,calc(100vw - 2rem)); }
.toast { background: var(--brand-dark); color: white; padding: 1rem 1.2rem; border-radius: .5rem; box-shadow: 0 6px 25px #132f4433; }
.toast.error { background: #8e3035; }
.modal-backdrop { position: fixed; inset: 0; background: #112f4480; z-index: 15; display: grid; place-items: center; padding: 1rem; }
.modal { background: white; padding: 1.5rem; max-width: 850px; width: 100%; border-radius: .6rem; max-height: 90vh; overflow: auto; }
.modal .close { float: right; }
.loading { color: var(--muted); padding: 2rem 0; }
.bar-row { display: grid; grid-template-columns: 135px 1fr 35px; align-items: center; gap: .8rem; margin: .75rem 0; font-size: .875rem; }
.bar { min-height: 18px; background: var(--brand); border-radius: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
footer { border-top: 1px solid var(--line); background: white; color: var(--muted); font-size: .875rem; padding: 1rem 2rem; }
.footer-inner { max-width: 1376px; margin: auto; display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.mobile-nav { display: none; }
@media (max-width: 1100px) {
  .layout { grid-template-columns: 215px minmax(0,1fr); }
  .content { padding: 1.5rem; }
  .grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .topline { padding: 1rem 1.5rem; }
}
@media (max-width: 760px) {
  .topline { padding: .9rem 1rem; align-items: start; }
  .top-actions { flex-direction: column; align-items: end; gap: .5rem; }
  .brand-mark { width: 38px; height: 38px; flex-shrink: 0; }
  .brand strong { font-size: .95rem; }
  .brand small { max-width: 180px; font-size: .8125rem; }
  .project-label { display: none; }
  .layout { display: block; }
  .sidebar { display: none; border-bottom: 1px solid var(--line); padding: .8rem; }
  .sidebar.open { display: block; }
  .mobile-nav { display: block; width: 100%; border-radius: 0; background: white; color: var(--brand); border: 0; border-bottom: 1px solid var(--line); text-align: left; padding: .7rem 1rem; }
  .content { padding: 1.2rem 1rem 2rem; }
  .hero { padding: 1.4rem; }
  .grid, .grid.two, .login-layout, .form-grid { grid-template-columns: 1fr; }
  .form-grid .full { grid-column: auto; }
  .section-heading { flex-wrap: wrap; }
  h1 { font-size: 2rem; }
  footer { padding: 1rem; }
  .hero .actions > * { width: 100%; }
  .account-label { display: none; }
}
`;
