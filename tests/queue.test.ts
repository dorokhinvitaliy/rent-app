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

test('Bulk enrichment covers every real Cian listing in isolated batches without duplicating listings', async () => {
  process.env.DATABASE_PATH = ':memory:';
  const store = new Store(),
    importer = new Importer(store);
  importer.launchBrowser = async (state: any) => {
    let url = '';
    const page = {
      goto: async (value: string) => {
        url = value;
        return { status: () => 200 };
      },
      waitForTimeout: async () => {},
      waitForFunction: async () => {},
      content: async () => {
        const offer = {
          id: Number(url.match(/flat\/(\d+)/)![1]),
          dealType: 'rent',
          bargainTerms: { price: 70000, currency: 'rur', paymentPeriod: 'monthly' },
          geo: { address: [], undergrounds: [] },
          building: { buildYear: 2024 },
          phones: [{ countryCode: '+7', number: '9990000000' }],
        };
        return `<h1>Обновлённая квартира</h1><script>window._cianConfig['frontend-offer-card'] = (window._cianConfig['frontend-offer-card'] || []).concat(${JSON.stringify([{ key: 'defaultState', value: { offerData: { offer } } }])});</script>`;
      },
    };
    state.page = page;
    state.context = { close: async () => {} };
    return page;
  };
  try {
    for (let i = 0; i < 5; i++)
      store.save(
        listingSchema.parse({
          title: 'Квартира',
          rent: 60000,
          source: 'cian',
          url: `https://www.cian.ru/rent/flat/${123456780 + i}/`,
        }),
      );
    store.save(listingSchema.parse({ title: 'Вручную', rent: 60000 }));
    const jobs = importer.refreshAll();
    assert.equal(jobs.length, 2);
    assert.deepEqual(
      importer
        .refreshAll()
        .map((j: any) => j.id)
        .sort(),
      jobs.map((j: any) => j.id).sort(),
    );
    for (let i = 0; i < 100 && jobs.some((j: any) => ['running', 'queued'].includes(j.status)); i++)
      await tick();
    assert.equal(
      jobs.reduce((n: number, j: any) => n + j.updated, 0),
      5,
    );
    assert.equal(store.all().filter((l: any) => l.details.checkedAt).length, 5);
    assert.equal(store.all().length, 6);
  } finally {
    await importer.onModuleDestroy();
    store.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  }
});
