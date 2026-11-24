import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBody } from './security.js';

test('размер JSON ограничивается байтами UTF-8, включая кириллицу', async () => {
  const request = new Request('http://localhost/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ about: 'я'.repeat(33000) })
  });
  await assert.rejects(() => parseBody(request), error => error.status === 413);
  const small = new Request('http://localhost/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ about: 'Проверка корректного запроса' })
  });
  assert.equal((await parseBody(small)).about, 'Проверка корректного запроса');
});
