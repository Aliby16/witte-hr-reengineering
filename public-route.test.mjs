import test from 'node:test';
import assert from 'node:assert/strict';
process.env.APP_ORIGIN = 'https://backend.example';
const { createGateway } = await import('./public-route.mjs');

const site = 'https://witte.example';
const backend = 'https://backend.example';

test('path, query and private session reach the fixed backend', async () => {
  let observed;
  const gateway = createGateway(async (url, options) => {
    observed = { url: String(url), ...options };
    return Response.json({ ok: true });
  });
  const response = await gateway.fetch(new Request(site + '/api/list/applications?q=a%26b', {
    headers: { Cookie: 'other=secret; witte_session=session-value', 'X-CSRF-Token': 'csrf-value', Authorization: 'not-forwarded' }
  }));
  assert.equal(response.status, 200);
  assert.equal(observed.url, backend + '/api/list/applications?q=a%26b');
  assert.equal(observed.headers.get('cookie'), 'witte_session=session-value');
  assert.equal(observed.headers.get('x-csrf-token'), 'csrf-value');
  assert.equal(observed.headers.get('authorization'), null);
});

test('same-origin JSON and session cookie survive the round trip', async () => {
  const gateway = createGateway(async (url, options) => {
    assert.equal(options.headers.get('origin'), backend);
    assert.equal(Buffer.from(options.body).toString(), '{"name":"Тест"}');
    return Response.json({ ok: true }, { headers: {
      'Set-Cookie': 'witte_session=token; Path=/; HttpOnly; SameSite=Strict; Secure',
      'Content-Encoding': 'gzip', 'Content-Length': '100',
      'Content-Security-Policy': "default-src 'self'"
    } });
  });
  const response = await gateway.fetch(new Request(site + '/api/login', {
    method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: '{"name":"Тест"}'
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Secure/);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('foreign origin and cross-site mutations are rejected before forwarding', async () => {
  const gateway = createGateway(() => { throw new Error('must not forward'); });
  for (const headers of [{ Origin: 'https://other.example' }, { Origin: site, 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await gateway.fetch(new Request(site + '/api/profile', { method: 'POST', headers, body: '{}' }));
    assert.equal(response.status, 403);
  }
});

test('oversized bodies are rejected with and without a declared length', async () => {
  const gateway = createGateway(() => { throw new Error('must not forward'); });
  for (const headers of [{}, { 'Content-Length': '2300000' }]) {
    const response = await gateway.fetch(new Request(site + '/api/files', { method: 'POST', headers, body: new Uint8Array(2300000) }));
    assert.equal(response.status, 413);
  }
});

test('redirects keep the new origin and reject unrelated targets', async () => {
  for (const location of ['/login?returnTo=%2Fapp%2Fprofile', backend + '/login?returnTo=%2Fapp%2Fprofile']) {
    const gateway = createGateway(async () => new Response(null, { status: 302, headers: { Location: location } }));
    const response = await gateway.fetch(new Request(site + '/app/profile'));
    assert.equal(response.headers.get('location'), site + '/login?returnTo=%2Fapp%2Fprofile');
  }
  const gateway = createGateway(async () => new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }));
  assert.equal((await gateway.fetch(new Request(site))).status, 502);
});

test('PDF bytes and filename are preserved, HEAD has no body', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
  const gateway = createGateway(async () => new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="test.pdf"' }
  }));
  const response = await gateway.fetch(new Request(site + '/api/files/test'));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="test.pdf"');
  const head = await gateway.fetch(new Request(site + '/api/files/test', { method: 'HEAD' }));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('upstream failures produce a bounded public error', async () => {
  const gateway = createGateway(async () => { throw new Error('sensitive upstream details'); });
  const response = await gateway.fetch(new Request(site + '/'));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /sensitive|chatgpt|kseniia/);
});
