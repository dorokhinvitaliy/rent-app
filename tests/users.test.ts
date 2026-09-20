import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { listingSchema } from '@rent/shared';
import ExcelJS from 'exceljs';

test('Guests see shared offers; owner migration and all personal data remain isolated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rent-users-')),
    path = join(dir, 'db.sqlite');
  const db = new DatabaseSync(path);
  const id = '11111111-1111-4111-8111-111111111111';
  const legacy = {
    ...listingSchema.parse({ title: 'Общая квартира', rent: 70000, address: 'Москва' }),
    id,
    notes: 'Личная заметка владельца',
    favorite: true,
    rating: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    demo: false,
  };
  db.exec('CREATE TABLE listings(id TEXT PRIMARY KEY,url TEXT UNIQUE,data TEXT NOT NULL)');
  db.prepare('INSERT INTO listings VALUES(?,?,?)').run(id, null, JSON.stringify(legacy));
  db.close();
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], {
    env: {
      ...process.env,
      PORT: '3098',
      DATA_DIR: dir,
      DATABASE_PATH: path,
    },
    stdio: 'pipe',
  });
  const client = () => {
    let cookies: Record<string, string> = {};
    return {
      async request(path: string, method = 'GET', data?: unknown) {
        const r = await fetch('http://127.0.0.1:3098/api' + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Cookie: Object.entries(cookies)
              .map(([k, v]) => `${k}=${v}`)
              .join('; '),
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
        for (const c of r.headers.getSetCookie()) {
          const [key, ...value] = c.split(';')[0].split('=');
          cookies[key] = value.join('=');
        }
        return r;
      },
    };
  };
  const guest = client(),
    owner = client(),
    member = client();
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await guest.request('/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready);
    const offers = await (await guest.request('/listings')).json();
    assert.equal(offers[0].notes, '');
    assert.equal(offers[0].favorite, false);
    assert.equal(offers[0].rating, null);
    assert.equal((await guest.request('/listings/' + id, 'PATCH', { notes: 'no' })).status, 401);
    assert.equal((await guest.request('/collections', 'POST', { name: 'no' })).status, 401);
    assert.equal((await guest.request('/export.xlsx')).status, 200);
    const register = (email: string) => ({
      email,
      password: 'long-password-123',
    });
    const a = await owner.request('/auth/register', 'POST', register('owner@example.test'));
    assert.equal(a.status, 201);
    const user = await a.json();
    assert.equal(user.role, 'admin');
    assert.equal((await (await owner.request('/listings')).json())[0].notes, legacy.notes);
    assert.equal(
      (await member.request('/auth/register', 'POST', register('member@example.test'))).status,
      201,
    );
    assert.equal((await (await member.request('/auth/me')).json()).user.role, 'member');
    const manual = { title: 'Ручная квартира', rent: 50000, source: 'manual' };
    assert.equal((await guest.request('/listings', 'POST', manual)).status, 401);
    assert.equal((await member.request('/listings', 'POST', manual)).status, 403);
    assert.equal(
      (
        await member.request('/listings', 'POST', {
          ...manual,
          source: 'cian',
          url: 'https://www.cian.ru/rent/flat/334056198/',
        })
      ).status,
      403,
    );
    const created = await owner.request('/listings', 'POST', manual);
    assert.equal(created.status, 201);
    const createdId = (await created.json()).id;
    assert.equal(
      (await owner.request('/listings/' + createdId, 'PATCH', { rent: 51000 })).status,
      200,
    );
    await owner.request('/listings/' + createdId, 'DELETE', {});

    assert.equal((await (await member.request('/listings')).json())[0].notes, '');
    await member.request('/listings/' + id, 'PATCH', {
      notes: 'Заметка второго',
      rating: 1,
      favorite: true,
    });
    assert.equal((await (await owner.request('/listings')).json())[0].rating, 5);
    assert.equal((await (await guest.request('/listings')).json())[0].rating, null);
    const group = await (
      await owner.request('/collections', 'POST', { name: 'Личная подборка', listingIds: [id] })
    ).json();
    assert.deepEqual(await (await member.request('/collections')).json(), []);
    assert.equal(
      (await member.request('/collections/' + group.id + '/listings', 'POST', { listingIds: [id] }))
        .status,
      404,
    );
    assert.equal(
      (
        await member.request('/collections/' + group.id + '/listings', 'DELETE', {
          listingIds: [id],
        })
      ).status,
      404,
    );
    assert.equal((await member.request('/listings/' + id, 'PATCH', { rent: 1 })).status, 403);
    assert.equal((await member.request('/listings/' + id, 'DELETE', {})).status, 403);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(await (await member.request('/export.xlsx')).arrayBuffer()) as any,
    );
    const values = JSON.stringify(workbook.worksheets[0].getSheetValues());
    assert.ok(values.includes('Заметка второго'));
    assert.ok(!values.includes(legacy.notes));
    const raw = new DatabaseSync(path);
    assert.equal(
      JSON.parse(raw.prepare('SELECT data FROM listings').get()!.data as string).notes,
      '',
    );
    raw
      .prepare('INSERT INTO imports VALUES(?,?)')
      .run(
        'owner-job',
        JSON.stringify({ id: 'owner-job', userId: user.id, status: 'done', warnings: [] }),
      );
    raw.close();
    assert.equal((await (await owner.request('/imports')).json()).length, 1);
    assert.deepEqual(await (await member.request('/imports')).json(), []);
    assert.equal((await member.request('/imports/owner-job/cancel', 'POST', {})).status, 404);
    await member.request('/auth/logout', 'POST', {});
    assert.equal((await (await member.request('/auth/me')).json()).user, null);
    assert.equal((await (await member.request('/listings')).json())[0].notes, '');
    assert.equal(
      (
        await member.request('/auth/login', 'POST', {
          email: 'member@example.test',
          password: 'wrong-password',
        })
      ).status,
      401,
    );
    assert.equal(
      (await member.request('/auth/login', 'POST', register('member@example.test'))).status,
      201,
    );
    assert.equal((await (await member.request('/listings')).json())[0].notes, 'Заметка второго');
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
});
