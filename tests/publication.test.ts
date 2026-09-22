import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { listingSchema, cianSearchSchema, matchesDatabaseSearch } from '@rent/shared';
import { isRemovedOffer } from '../apps/api/src/parser';
const require = createRequire(import.meta.url);
const { Store } = require('../apps/api/dist/store.js');
const { Importer } = require('../apps/api/dist/importer.js');

test('Only confirmed withdrawal notices mark an offer removed', () => {
  assert.equal(isRemovedOffer('<h1>Объявление снято с публикации</h1>', 200), true);
  assert.equal(isRemovedOffer('<div data-name="OfferStatus">Объявление в архиве</div>', 200), true);
  assert.equal(isRemovedOffer('', 410), true);
  for (const status of [403, 429, 500, 503])
    assert.equal(isRemovedOffer('<h1>Объявление снято с публикации</h1>', status), false);
  assert.equal(
    isRemovedOffer('<title>Captcha</title><h1>Объявление снято с публикации</h1>', 200),
    false,
  );
  assert.equal(isRemovedOffer('<h1>Страница не найдена</h1>', 404), false);
  assert.equal(
    isRemovedOffer(
      '<div data-name="Description"><h2>Объявление снято с публикации</h2></div>',
      200,
    ),
    false,
  );
  assert.equal(isRemovedOffer('<script>"Объявление снято с публикации"</script>', 200), false);
});

test('Refresh preserves a removed listing and its data, excludes it from search, and restores a republished offer', async () => {
  process.env.DATABASE_PATH = ':memory:';
  const store = new Store();
  const importer = new Importer(store);
  const url = 'https://www.cian.ru/rent/flat/123456789/';
  let html = '<h1>Объявление снято с публикации</h1>';
  let status = 200;
  importer.launchBrowser = async (state: any) => {
    const page = {
      goto: async () => ({ status: () => status }),
      waitForTimeout: async () => {},
      waitForFunction: async () => {},
      content: async () => html,
    };
    state.page = page;
    state.context = { close: async () => {} };
    return page;
  };
  const refresh = async () => {
    const job = importer.start(url, 1, 1);
    for (let i = 0; i < 100 && ['queued', 'running'].includes(job.status); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    return job;
  };
  try {
    const saved = store.save(
      listingSchema.parse({
        title: 'Сохранённая квартира',
        url,
        source: 'cian',
        address: 'Москва',
        rent: 70000,
      }),
    );
    const original = { ...saved, notes: 'Не потерять заметку', favorite: true, rating: 5 };
    store.db
      .prepare('UPDATE listings SET data=? WHERE id=?')
      .run(JSON.stringify(original), saved.id);
    const job = await refresh();
    assert.equal(job.status, 'done');
    assert.deepEqual(job.removedIds, [saved.id]);
    assert.equal(store.all().length, 1);
    const removed = store.get(saved.id);
    assert.equal(removed.publicationStatus, 'removed');
    assert.equal(removed.notes, original.notes);
    assert.equal(removed.rating, 5);
    assert.equal(removed.favorite, true);
    assert.equal(removed.rent, 70000);
    assert.equal(matchesDatabaseSearch(removed, cianSearchSchema.parse({})), false);
    html = '<h1>Ошибка сервера</h1>';
    status = 503;
    await refresh();
    assert.equal(store.get(saved.id).publicationStatus, 'removed');
    html = readFileSync(new URL('./fixtures/cian-detail.html', import.meta.url), 'utf8');
    status = 200;
    const restored = await refresh();
    assert.ok(restored.count > 0);
    assert.equal(store.get(saved.id).publicationStatus, 'active');
    assert.equal(store.get(saved.id).notes, original.notes);
    assert.equal(store.all().length, 1);
  } finally {
    await importer.onModuleDestroy();
    store.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  }
});
