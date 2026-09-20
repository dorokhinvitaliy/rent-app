import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cianSearchSchema, listingSchema } from '@rent/shared';
const require = createRequire(import.meta.url);
const { Importer } = require('../apps/api/dist/importer.js');
const { Store } = require('../apps/api/dist/store.js');
const { userContext } = require('../apps/api/dist/user-context.js');
const tick = () => new Promise((r) => setTimeout(r, 10));
test('Two isolated browser slots, FIFO queue, cancellation and owner context', async () => {
  const { chromium } = await import('playwright');
  const original = chromium.launchPersistentContext;
  const profiles: string[] = [];
  chromium.launchPersistentContext = async (profile: string) => {
    profiles.push(profile);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const page = {
      on() {},
      setDefaultNavigationTimeout() {},
      goto: async () => {
        await gate;
        throw new Error('closed');
      },
    };
    return { route: async () => {}, pages: () => [page], close: async () => release() } as any;
  };
  process.env.DATABASE_PATH = ':memory:';
  const store = new Store(),
    importer = new Importer(store);
  const owner = (id: string, cb: () => any) => userContext.run({ id, role: 'guest' }, cb);
  const start = (id: number) =>
    importer.start(`https://www.cian.ru/rent/flat/${123456780 + id}/`, 1, 1);
  try {
    const a = owner('a', () => importer.search(cianSearchSchema.parse({})).job);
    assert.ok(a);
    const b = owner('b', () => start(2));
    const c = owner('c', () => start(3));
    const d = owner('d', () => start(4));
    assert.equal(c.status, 'queued');
    assert.equal(owner('c', () => start(3)).id, c.id);
    await tick();
    assert.equal(profiles.length, 2);
    assert.notEqual(profiles[0], profiles[1]);
    await owner('d', () => importer.cancel(d.id));
    await owner('a', () => importer.cancel(a.id));
    await tick();
    assert.equal(profiles.length, 3);
    assert.equal(profiles[2], profiles[0]);
    assert.equal(owner('c', () => store.jobs())[0].status, 'running');
    assert.equal(owner('a', () => store.jobs()).length, 1);
    assert.equal(owner('d', () => store.jobs())[0].status, 'cancelled');
    await owner('b', () => importer.cancel(b.id));
    await owner('c', () => importer.cancel(c.id));
    await tick();
  } finally {
    await importer.onModuleDestroy();
    await tick();
    store.onModuleDestroy();
    chromium.launchPersistentContext = original;
    delete process.env.DATABASE_PATH;
  }
});
test('Database search only collects below ten matches and reuses recent searches', async () => {
  process.env.DATABASE_PATH = ':memory:';
  const store = new Store(),
    importer = new Importer(store);
  const criteria = cianSearchSchema.parse({});
  try {
    for (let i = 0; i < 10; i++)
      store.save(listingSchema.parse({ title: 'Квартира', address: 'Москва', rent: 50000 }));
    assert.equal(importer.search(criteria).reason, 'enough');
    assert.equal(importer.search(criteria).job, null);
    const narrow = cianSearchSchema.parse({ maxRent: 10000 });
    store.saveJob({
      id: 'recent',
      search: narrow,
      createdAt: new Date().toISOString(),
      status: 'done',
    });
    assert.equal(importer.search(narrow).count, 0);
    assert.equal(importer.search(narrow).job.id, 'recent');
    assert.equal(importer.search(cianSearchSchema.parse({ source: 'manual' })).reason, 'source');
  } finally {
    store.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  }
});
