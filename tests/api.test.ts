import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import ExcelJS from 'exceljs';
test('API integration: CRUD, validation, HTML import, deduplication, filtered XLSX and local origin guard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesto-api-'));
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], {
    env: {
      ...process.env,
      PORT: '3099',
      DATABASE_PATH: join(dir, 'db.sqlite'),
    },
    stdio: 'pipe',
  });
  let cookie = '';
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch('http://127.0.0.1:3099/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await request('/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.equal(ready, true, 'Test API starts');
    const login = await request('/auth/register', 'POST', {
      email: 'api@example.test',
      password: 'integration-password',
    });
    assert.equal(login.status, 201);
    cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    assert.equal((await request('/listings', 'POST', { title: 'bad', rent: -100 })).status, 400);
    assert.equal(
      (await request('/demo', 'POST', {}, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal((await request('/search/cian', 'POST', { minArea: 90, maxArea: 20 })).status, 400);
    const created = await (
      await request('/listings', 'POST', { title: 'Тест API', rent: 65000 })
    ).json();
    assert.ok(created.id);
    assert.equal((await request('/listings/' + created.id + '/refresh', 'POST', {})).status, 400);
    assert.equal((await request('/listings/' + created.id, 'PATCH', { rating: 6 })).status, 400);
    assert.equal((await request('/listings/' + created.id, 'PATCH', { rating: 2.5 })).status, 400);
    assert.equal(
      (await (await request('/listings/' + created.id, 'PATCH', { rating: 5 })).json()).rating,
      5,
    );
    assert.equal(
      (await (await request('/listings/' + created.id, 'PATCH', { rating: null })).json()).rating,
      null,
    );
    assert.equal(created.utilities, null);
    const patched = await (
      await request('/listings/' + created.id, 'PATCH', {
        favorite: true,
        notes: 'Моя заметка',
        deposit: 65000,
      })
    ).json();
    assert.equal(patched.favorite, true);
    assert.equal((await request('/listings/' + created.id, 'PATCH', { rent: -1 })).status, 400);
    const html = readFileSync(resolve('tests/fixtures/cian-detail.html'), 'utf8');
    const payload = { url: 'https://www.cian.ru/rent/flat/123456789/', html };
    assert.equal((await request('/imports/html', 'POST', payload)).status, 201);
    await request('/imports/html', 'POST', payload);
    assert.equal((await (await request('/listings')).json()).length, 2);
    assert.equal(
      (await request('/imports/browser', 'POST', { url: 'https://localhost/', limit: 5 })).status,
      400,
    );
    assert.equal(
      (await request('/imports/html', 'POST', { ...payload, html: '<title>Вы не робот?</title>' }))
        .status,
      400,
    );
    const xlsx = await request('/export.xlsx?ids=' + created.id + '&months=6');
    assert.equal(xlsx.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));
    assert.equal(book.worksheets[0].rowCount, 2);
    assert.equal(book.worksheets[0].getCell('N2').value, 6);
    assert.equal((await request('/export.xlsx?months=0')).status, 400);
    assert.equal((await request('/listings/' + created.id, 'DELETE', {})).status, 200);
    assert.equal((await request('/listings/' + created.id, 'DELETE', {})).status, 404);
  } finally {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill('SIGTERM');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
