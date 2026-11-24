const UPSTREAM = process.env.APP_ORIGIN;
if (!UPSTREAM || new URL(UPSTREAM).protocol !== 'https:' || new URL(UPSTREAM).origin !== UPSTREAM) {
  throw new Error('APP_ORIGIN must be an HTTPS origin.');
}
const MAX_BODY = 2 * 1024 * 1024 + 65536;
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'x-csrf-token', 'range'];

function failure(status, message, extra = {}) {
  return Response.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }
  });
}

async function boundedBody(request) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function createGateway(fetchImpl = fetch) {
  return {
    async fetch(request) {
      const incoming = new URL(request.url);
      if (!METHODS.includes(request.method)) {
        return failure(405, 'Метод не поддерживается.', { Allow: METHODS.join(', ') });
      }
      const origin = request.headers.get('origin');
      if (!['GET', 'HEAD'].includes(request.method) &&
          ((origin && origin !== incoming.origin) || request.headers.get('sec-fetch-site') === 'cross-site')) {
        return failure(403, 'Недопустимый источник запроса.');
      }
      if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
        return failure(413, 'Запрос слишком большой.');
      }
      const upstream = new URL(UPSTREAM);
      upstream.pathname = incoming.pathname;
      upstream.search = incoming.search;
      const headers = new Headers();
      for (const name of REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      const session = (request.headers.get('cookie') || '').split(';')
        .map(value => value.trim()).find(value => value.startsWith('witte_session='));
      if (session) headers.set('cookie', session);
      if (origin === incoming.origin) headers.set('origin', UPSTREAM);
      try {
        const body = await boundedBody(request);
        if (body === null) return failure(413, 'Запрос слишком большой.');
        const result = await fetchImpl(upstream, {
          method: request.method,
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000)
        });
        const responseHeaders = new Headers(result.headers);
        for (const name of ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'server', 'via']) {
          responseHeaders.delete(name);
        }
        responseHeaders.delete('set-cookie');
        for (const cookie of result.headers.getSetCookie()) {
          if (cookie.startsWith('witte_session=')) responseHeaders.append('set-cookie', cookie);
        }
        const location = result.headers.get('location');
        if (location) {
          const target = new URL(location, UPSTREAM);
          if (target.origin !== UPSTREAM) return failure(502, 'Переход временно недоступен.');
          responseHeaders.set('location', incoming.origin + target.pathname + target.search + target.hash);
        }
        responseHeaders.set('Cache-Control', 'no-store');
        responseHeaders.set('X-Content-Type-Options', 'nosniff');
        return new Response(request.method === 'HEAD' ? null : result.body, {
          status: result.status,
          statusText: result.statusText,
          headers: responseHeaders
        });
      } catch {
        return failure(502, 'Не удалось получить ответ. Повторите запрос.');
      }
    }
  };
}

export default createGateway();
