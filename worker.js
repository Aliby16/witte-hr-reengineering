import { AppError, json, responseHeaders } from './security.js';
import { readSession } from './db.js';
import { handleApi, allowedApiMethods } from './api.js';
import { renderShell } from './ui.js';
import { STYLES } from './styles.js';
import { CLIENT } from './client.js';
import { PUBLIC_PAGES } from './public.js';
import { NeonAdapter } from './neon-db.js';

const PRIVATE_ROUTES = {
  admin: ['dashboard','users','departments','roles','audit','settings','requests','vacancies','applications','interviews','plans','reports','files','notifications','feedback','competencies','profile'],
  hr: ['dashboard','requests','vacancies','applications','interviews','plans','competencies','reports','files','notifications','feedback','profile'],
  candidate: ['dashboard','profile','applications','interviews','plans','files','notifications']
};

const worker = {
  async dispatch(request, env) {
    const url = new URL(request.url);
    try {
      if (env.DATABASE_URL) env={...env,DB:new NeonAdapter(env.DATABASE_URL)};
      if (url.pathname.startsWith('/api/')) {
        const methods=allowedApiMethods(url.pathname);
        if(methods&&!methods.includes(request.method))return json({error:'Метод не поддерживается.'},405,{Allow:methods.join(', ')});
        return await handleApi(request, env);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({error:'Метод не поддерживается.'},405,{Allow:'GET, HEAD'});
      if (url.pathname === '/assets/styles.css') return new Response(STYLES,{headers:responseHeaders('text/css; charset=utf-8')});
      if (url.pathname === '/assets/client.js') return new Response(CLIENT,{headers:responseHeaders('text/javascript; charset=utf-8')});
      if (url.pathname === '/favicon.ico') return new Response(null,{status:204});
      let user = null;
      if (env.DB) user = await readSession(request,env);
      if (url.pathname.startsWith('/app/')) {
        if (!user) return new Response(null,{status:302,headers:{Location:'/login','Cache-Control':'no-store'}});
        const page=url.pathname.slice(5);
        if (!PRIVATE_ROUTES[user.role_id]?.includes(page)) {
          return new Response(renderShell(url.pathname,user,'Доступ к разделу ограничен вашей ролью.'),{status:403,headers:responseHeaders('text/html; charset=utf-8')});
        }
      } else if (url.pathname !== '/' && url.pathname !== '/login') {
        const page = url.pathname.startsWith('/p/') ? url.pathname.slice(3) : '';
        if (!PUBLIC_PAGES[page]) return new Response(renderShell(url.pathname,user,'Страница не найдена.'),{status:404,headers:responseHeaders('text/html; charset=utf-8')});
      }
      return new Response(renderShell(url.pathname,user),{headers:responseHeaders('text/html; charset=utf-8')});
    } catch (error) {
      if (error instanceof AppError) return json({error:error.message},error.status);
      console.error('Application error',{request_id:env.REQUEST_ID,name:/^[A-Za-z]{1,40}$/.test(error.name||'')?error.name:'Error',code:/^[A-Z0-9]{1,10}$/.test(error.code||'')?error.code:undefined});
      if (/UNIQUE constraint|duplicate key/i.test(error.message||'')) return json({error:'Такая запись уже существует. Обновите страницу.'},409);
      return json({error:'Не удалось выполнить действие. Повторите позже.',request_id:env.REQUEST_ID},500);
    }
  }
};

worker.fetch=async function(request,env){
  const isHead=request.method==='HEAD';
  const requestId=crypto.randomUUID();
  const response=await worker.dispatch(isHead?new Request(request,{method:'GET'}):request,{...env,REQUEST_ID:requestId});
  const headers=new Headers(response.headers);
  headers.set('X-Request-Id',requestId);
  for(const [name,value]of Object.entries(responseHeaders()))if(name!=='Content-Type'&&!headers.has(name))headers.set(name,value);
  return new Response(isHead?null:response.body,{status:response.status,headers});
};

export default worker;
