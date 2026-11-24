import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBody, validatedInteger } from './security.js';

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

test('оценка не принимает логические значения, массивы и экспоненциальную запись', () => {
  for (const value of [false, true, [], [1], {}, '1e0', '0x1']) {
    assert.throws(() => validatedInteger(value, 0, 5, 'Оценка'), error => error.status === 400);
  }
  assert.equal(validatedInteger(' 3 ', 0, 5, 'Оценка'), 3);
  assert.equal(validatedInteger(0, 0, 5, 'Оценка'), 0);
});
