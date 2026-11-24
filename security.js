const enc = new TextEncoder();

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function now() {
  return new Date().toISOString();
}

export function safeText(value, limit = 2000) {
  if (typeof value !== 'string') return '';
  const normalized=value.normalize('NFC').replace(/\r\n?/g,'\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g,'').trim();
  return Array.from(normalized).slice(0,Math.max(0,limit)).join('');
}

export function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function xmlEscape(value) {
  return htmlEscape(value);
}

export async function digest(value) {
  const buffer = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256'
  }, key, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function equalHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function must(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}

export function requireRole(user, roles) {
  must(user, 'Войдите в личный кабинет.', 401);
  must(roles.includes(user.role_id), 'Для этого действия недостаточно прав.', 403);
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split(/=(.*)/s)).filter(pair => pair[0]));
}

export function responseHeaders(type = 'application/json; charset=utf-8') {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...responseHeaders(), ...extra } });
}

export async function parseBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  must(contentLength <= 65536, 'Запрос слишком большой.', 413);
  must((request.headers.get('content-type') || '').includes('application/json'), 'Ожидается JSON.', 415);
  const text = await request.text();
  must(enc.encode(text).byteLength <= 65536, 'Запрос слишком большой.', 413);
  try {
    const body = JSON.parse(text);
    must(body && typeof body === 'object' && !Array.isArray(body), 'Неверный формат запроса.');
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'Не удалось прочитать JSON.');
  }
}

export function validateDate(value, withTime = false) {
  const text = safeText(value, 40);
  const match=text.match(withTime?
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/:
    /^(\d{4}-\d{2}-\d{2})$/);
  must(match,'Укажите корректную дату.');
  const day=Date.parse(match[1]+'T00:00:00.000Z');
  must(Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===match[1], 'Такой даты не существует.');
  if(!withTime)return match[1];
  must(Number(match[2])<24&&Number(match[3])<60&&Number(match[4]||0)<60,'Укажите корректное время.');
  const zone=match[6]||'Z';
  if(zone!=='Z')must(Number(zone.slice(1,3))<=14&&Number(zone.slice(4))<60&&
    (Number(zone.slice(1,3))!==14||zone.slice(4)==='00'),'Укажите корректный часовой пояс.');
  const instant=Date.parse(text+(match[6]?'':'Z'));
  must(Number.isFinite(instant),'Укажите корректную дату.');
  return new Date(instant).toISOString();
}

export function validatedInteger(value, min, max, label) {
  must(value !== '' && value !== null && value !== undefined, `Заполните поле «${label}».`);
  must(typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value.trim())),
    `${label}: введите целое число.`);
  const parsed = Number(value);
  must(Number.isInteger(parsed) && parsed >= min && parsed <= max, `${label}: допустимо целое число от ${min} до ${max}.`);
  return parsed;
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) must(origin === new URL(request.url).origin, 'Недопустимый источник запроса.', 403);
  const fetchSite = request.headers.get('sec-fetch-site');
  must(fetchSite !== 'cross-site', 'Недопустимый источник запроса.', 403);
}
