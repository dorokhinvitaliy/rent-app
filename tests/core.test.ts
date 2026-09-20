import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { listingSchema, costs } from '@rent/shared';
import { parseHtml, sourceUrl, isChallenge, extractLinks } from '../apps/api/src/parser';
import { exportWorkbook } from '../apps/api/src/export';
import ExcelJS from 'exceljs';
const require = createRequire(import.meta.url);
const fixture = readFileSync(new URL('./fixtures/cian-detail.html', import.meta.url), 'utf8');
const url = 'https://www.cian.ru/rent/flat/123456789/';
const input = listingSchema.parse({
  title: 'Тестовая квартира',
  rent: 85000,
  utilities: 6000,
  deposit: 85000,
  commission: 50,
});
test('Cost calculation separates refundable deposit and amortizes one-off costs', () => {
  assert.deepEqual(costs(input, 12), {
    fee: 42500,
    monthly: 91000,
    moveIn: 218500,
    total: 1134500,
    cashTotal: 1219500,
    average: 94541.67,
    incomplete: false,
  });
  assert.equal(
    costs({ ...input, commissionType: 'fixed', commission: 20000, otherCosts: 3000 }, 3).total,
    296000,
  );
  assert.throws(() => costs(input, 0));
  assert.throws(() => costs(input, 1.5));
});
test('Unknown costs remain unknown while explicit zero is complete', () => {
  const l = listingSchema.parse({ title: 'Квартира', rent: 60000 });
  assert.equal(l.deposit, null);
  assert.equal(costs(l).incomplete, true);
  assert.equal(costs({ ...l, utilities: 0, deposit: 0, commission: 0 }).incomplete, false);
  assert.equal(listingSchema.safeParse({ ...l, rent: -1 }).success, false);
  assert.equal(listingSchema.safeParse({ ...l, photos: ['javascript:alert(1)'] }).success, false);
});
test('Cian DOM captures monthly price, photos, fixed expenses and percent commission', () => {
  const { listings } = parseHtml(fixture, url);
  assert.equal(listings.length, 1);
  const l = listings[0];
  assert.equal(l.rent, 85000);
  assert.equal(l.deposit, 85000);
  assert.equal(l.commission, 50);
  assert.equal(l.utilities, 6000);
  assert.equal(l.area, 54);
  assert.equal(l.floor, 12);
  assert.equal(l.rooms, 2);
  assert.equal(l.photos.length, 2);
  assert.equal(l.commissionType, 'percent');
});
test('Explicit no deposit/commission and utilities included map to zero', () => {
  const html = fixture.replace(
    'Залог 85 000 ₽. Комиссия 50%. Коммунальные платежи 6 000 ₽.',
    'Без залога. Без комиссии. Коммунальные платежи включены.',
  );
  const l = parseHtml(html, url).listings[0];
  assert.equal(l.deposit, 0);
  assert.equal(l.commission, 0);
  assert.equal(l.utilities, 0);
});
test('Utilities included except meters remain unknown', () => {
  const html = fixture.replace(
    'Коммунальные платежи 6 000 ₽.',
    'Коммунальные платежи включены, кроме счетчиков.',
  );
  assert.equal(parseHtml(html, url).listings[0].utilities, null);
});
test('Malformed JSON-LD falls back to DOM without executing scripts', () => {
  const html = fixture.replace(
    '</head>',
    '<script type="application/ld+json">INVALID</script><script>throw new Error("never execute")</script></head>',
  );
  assert.equal(parseHtml(html, url).listings[0].rent, 85000);
});
test('JSON-LD monthly listing supports Yandex experimental adapter', () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@type': 'Apartment',
      name: 'Студия 30 м²',
      address: { addressLocality: 'Москва', streetAddress: 'Тестовая, 1' },
      offers: { price: 50000, priceCurrency: 'RUB' },
      image: ['https://example.com/1.jpg'],
    }) +
    '</script>';
  const l = parseHtml(html, 'https://realty.yandex.ru/offer/123456/').listings[0];
  assert.equal(l.rent, 50000);
  assert.equal(l.source, 'yandex');
  assert.equal(l.rooms, 0);
  assert.equal(l.deposit, null);
});
test('Catalog parsing deduplicates links and rejects sale / daily listings', () => {
  const card =
    '<article data-name="CardComponent"><a href="' +
    url +
    '?utm_source=test">Квартира</a><span data-mark="OfferTitle">1-комн. квартира 40 м²</span><div data-mark="MainPrice">60 000 ₽/мес.</div></article>';
  const catalog = 'https://www.cian.ru/cat.php?deal_type=rent&type=4&region=1';
  assert.equal(parseHtml(card + card, catalog).listings.length, 1);
  assert.equal(extractLinks(card + card, catalog).length, 1);
  assert.throws(() => parseHtml(fixture.replace('85 000 ₽/мес.', '5 000 ₽/сутки'), url));
  assert.throws(() => sourceUrl('https://www.cian.ru/sale/flat/123/'));
});
test('CAPTCHA is an explicit error, not an empty successful import', () => {
  assert.equal(isChallenge('<title>Вы не робот?</title>'), true);
  assert.throws(() => parseHtml('<title>Вы не робот?</title>', url), /проверку/);
});
test('URL restrictions reject external hosts, credentials, ports, unsafe schemes and short-term search', () => {
  for (const u of [
    'http://www.cian.ru/rent/flat/123/',
    'https://www.cian.ru.evil.test/rent/flat/123/',
    'https://localhost/',
    'https://user@www.cian.ru/rent/flat/123/',
    'https://www.cian.ru:8000/rent/flat/123/',
    'https://www.cian.ru/cat.php?deal_type=rent&type=2',
  ])
    assert.throws(() => sourceUrl(u));
  assert.equal(sourceUrl(url + '?utm=1#x').url, url);
});
test('SQLite persists edits, deduplicates imports, and retains unknown fields on refresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesto-store-'));
  process.env.DATABASE_PATH = join(dir, 'db.sqlite');
  const { Store } = require('../apps/api/dist/store.js');
  let store = new Store();
  try {
    const l = store.save({ ...input, url });
    store.patch(l.id, { favorite: true, notes: 'Позвонить вечером' });
    const updated = store.save({ ...input, url, rent: 87000, deposit: null });
    assert.equal(updated.id, l.id);
    assert.equal(updated.deposit, 85000);
    assert.equal(updated.notes, 'Позвонить вечером');
    assert.equal(updated.favorite, true);
    assert.equal(store.all().length, 1);
    store.onModuleDestroy();
    store = new Store();
    assert.equal(store.get(l.id).rent, 87000);
    store.remove(l.id);
    assert.equal(store.all().length, 0);
  } finally {
    store.onModuleDestroy();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  }
});
test('XLSX contains numeric data, calculated formulas, cached totals and no formula injection', async () => {
  const listing = {
    ...input,
    id: '1',
    title: '=HYPERLINK("bad")',
    rating: 5,
    notes: '=SUM(1,2)',
    favorite: false,
    demo: false,
    createdAt: '',
    updatedAt: '',
    url,
  };
  const bytes = await exportWorkbook([listing], 12);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.getWorksheet('Квартиры')!;
  assert.equal(sheet.getCell('A2').value, listing.title);
  assert.equal(sheet.getCell('S2').value, listing.notes);
  assert.equal(sheet.getCell('E2').value, 85000);
  assert.equal(sheet.getCell('V2').value, 5);
  assert.deepEqual(sheet.getCell('M2').value, { formula: 'L2+G2+K2+J2', result: 218500 });
  assert.equal(book.worksheets.length, 2);
});

test('Detail parser excludes recommended cards and their unrelated prices and commissions', () => {
  const recommended =
    '<article data-name="CardComponent"><a href="https://www.cian.ru/rent/flat/999/">1-комн. квартира</a><div data-mark="MainPrice">20 000 ₽/мес.</div>Без комиссии</article>';
  const html = fixture.replace('</body>', recommended + '</body>');
  const result = parseHtml(html, url);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].url, url);
  assert.equal(result.listings[0].commission, 50);
  assert.equal(result.listings[0].rent, 85000);
});

test('Search URL maps user criteria to Cian catalog and rejects inverted ranges', async () => {
  const { cianSearchSchema, buildCianSearchUrl } = await import('@rent/shared');
  const s = cianSearchSchema.parse({
    region: '2',
    rooms: [0, 2],
    minRent: 50000,
    maxRent: 90000,
    minArea: 40,
    maxArea: 70,
    metroMinutes: 10,
    minFloor: 3,
  });
  const p = new URL(buildCianSearchUrl(s)).searchParams;
  for (const [k, v] of Object.entries({
    region: '2',
    room9: '1',
    room2: '1',
    minprice: '50000',
    maxprice: '90000',
    mintarea: '40',
    maxtarea: '70',
    only_foot: '2',
    foot_min: '10',
    minfloor: '3',
    type: '4',
    deal_type: 'rent',
  }))
    assert.equal(p.get(k), v);
  assert.equal(cianSearchSchema.safeParse({ minArea: 70, maxArea: 30 }).success, false);
  assert.equal(cianSearchSchema.safeParse({ minRent: 90000, maxRent: 50000 }).success, false);
  assert.equal(cianSearchSchema.safeParse({ region: 'unknown' }).success, false);
});

test('Search matching never treats missing area, walking time or commission as a match', async () => {
  const { cianSearchSchema, searchMismatch } = await import('@rent/shared');
  const criteria = cianSearchSchema.parse({
    minArea: 40,
    maxArea: 60,
    rooms: [2],
    metroMinutes: 10,
    noCommission: true,
  });
  const good = { ...input, rooms: 2, area: 54, metroMinutes: 8, commission: 0 };
  assert.equal(searchMismatch(good, criteria), null);
  for (const patch of [
    { area: null },
    { area: 70 },
    { metroMinutes: null },
    { metroMinutes: 11 },
    { commission: null },
    { commission: 50 },
    { rooms: 1 },
  ])
    assert.ok(searchMismatch({ ...good, ...patch }, criteria));
});

test('Metro parser selects nearest explicitly walkable station and ignores driving time', () => {
  const html = fixture.replace(
    '</body>',
    '<div data-name="UndergroundItem"><a>Дальняя</a> 3 мин. на машине</div><div data-name="UndergroundItem"><a>Парк</a> 8 мин. пешком</div><div data-name="UndergroundItem"><a>Центр</a> 12 мин. пешком</div></body>',
  );
  const l = parseHtml(html, url).listings[0];
  assert.equal(l.metro, 'Парк');
  assert.equal(l.metroMinutes, 8);
  const unknown = parseHtml(
    fixture.replace(
      '</body>',
      '<div data-name="UndergroundItem"><a>Дальняя</a> 3 мин. на машине</div></body>',
    ),
    url,
  ).listings[0];
  assert.equal(unknown.metroMinutes, null);
});

test('Search worker saves only matching offers and returns their IDs (stubbed browser)', async () => {
  const { chromium } = await import('playwright');
  const { cianSearchSchema, buildCianSearchUrl } = await import('@rent/shared');
  const { Importer } = require('../apps/api/dist/importer.js');
  const { Store } = require('../apps/api/dist/store.js');
  const original = chromium.launchPersistentContext;
  let pageUrl = '';
  const second = 'https://www.cian.ru/rent/flat/987654321/';
  const third = 'https://www.cian.ru/rent/flat/987654322/';
  let extra = false;
  let freshRent = 100000;
  const criteria = cianSearchSchema.parse({ minRent: 90000, limit: 1, pages: 1 });
  const fakePage = {
    on() {},
    setDefaultNavigationTimeout() {},
    async goto(u: string) {
      pageUrl = u;
      return { status: () => 200 };
    },
    async waitForTimeout() {},
    async waitForFunction() {},
    async content() {
      return pageUrl.includes('cat.php')
        ? `<a href="${url}">One</a><a href="${second}">Two</a>${extra ? `<a href="${third}">Three</a>` : ''}`
        : pageUrl === second || pageUrl === third
          ? fixture.replace('85 000 ₽/мес.', `${freshRent} ₽/мес.`)
          : fixture;
    },
  };
  chromium.launchPersistentContext = async () =>
    ({ route: async () => {}, pages: () => [fakePage], close: async () => {} }) as any;
  process.env.DATABASE_PATH = ':memory:';
  const store = new Store();
  try {
    const importer = new Importer(store);
    const job = importer.start(buildCianSearchUrl(criteria), 1, 1, criteria);
    for (let i = 0; i < 100; i++) {
      if (!['running', 'waiting'].includes(store.jobs()[0].status)) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const done = store.jobs()[0];
    assert.equal(done.id, job.id);
    assert.equal(done.count, 1);
    assert.equal(done.scanned, 2);
    assert.equal(done.skipped, 1);
    assert.equal(store.all().length, 1);
    assert.equal(store.all()[0].rent, 100000);
    assert.deepEqual(done.listingIds, [store.all()[0].id]);
    assert.equal(done.added, 1);
    assert.equal(done.updated, 0);
    const firstId = store.all()[0].id;
    store.patch(firstId, { favorite: true, notes: 'Сохранить заметку', rating: 5 });
    extra = true;
    const again = async (onlyNew: boolean) => {
      const next = { ...criteria, onlyNew };
      importer.start(buildCianSearchUrl(next), 1, 1, next);
      for (let i = 0; i < 100; i++) {
        if (!['running', 'waiting'].includes(store.jobs()[0].status)) break;
        await new Promise((r) => setTimeout(r, 5));
      }
      return store.jobs()[0];
    };
    const secondRun = await again(true);
    assert.equal(secondRun.added, 1);
    assert.equal(secondRun.alreadySaved, 1);
    assert.equal(store.all().length, 2);
    freshRent = 110000;
    const refreshRun = await again(false);
    assert.equal(refreshRun.added, 0);
    assert.equal(refreshRun.updated, 1);
    assert.equal(store.all().length, 2);
    assert.equal(store.get(firstId).favorite, true);
    assert.equal(store.get(firstId).notes, 'Сохранить заметку');
    assert.equal(store.get(firstId).rating, 5);
    assert.equal(store.get(firstId).rent, 110000);
    const exhausted = await again(true);
    assert.equal(exhausted.added, 0);
    assert.equal(exhausted.alreadySaved, 2);
    assert.equal(exhausted.status, 'done');
    assert.equal(store.all().length, 2);
  } finally {
    chromium.launchPersistentContext = original;
    store.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  }
});

// Minimal financial/transport fields from three live Cian offers, 2026-09-20.
const offers = JSON.parse(
  readFileSync(new URL('./fixtures/cian-offers.json', import.meta.url), 'utf8'),
);
function stateHtml(offer: any, displayed = offer.bargainTerms.price) {
  return `<h1>Квартира</h1><aside>Рекомендации: 26 000 ₽/мес. 5 000 ₽ за сутки</aside>
  <div data-name="PriceInfo">${displayed} ₽/мес.</div>
  <script>window._cianConfig['frontend-offer-card'] = (window._cianConfig['frontend-offer-card'] || []).concat(${JSON.stringify([{ key: 'defaultState', value: { offerData: { offer } } }])});</script>`;
}
test('Cian own offer state ignores daily ads, other prices and agent fee; preserves walking metro and unknown meters', () => {
  for (const [i, expected] of [
    [0, [82500, 82500, 13, null]],
    [1, [29900, null, 6, 0]],
    [2, [80000, 80000, 6, null]],
  ] as const) {
    const offer = offers[i];
    const l = parseHtml(stateHtml(offer), `https://www.cian.ru/rent/flat/${offer.id}/`).listings[0];
    assert.deepEqual([l.rent, l.deposit, l.metroMinutes, l.utilities], expected);
    assert.equal(l.commission, 0);
    assert.deepEqual(l.photos, ['https://images.cdn-cian.ru/example-own.jpg']);
  }
});
test('Cian state rejects a different offer, conflicting price and actual daily rental', () => {
  const offer = structuredClone(offers[0]);
  const ownUrl = `https://www.cian.ru/rent/flat/${offer.id}/`;
  assert.throws(() => parseHtml(stateHtml(offer), url), /ID/);
  assert.throws(() => parseHtml(stateHtml(offer, 26000), ownUrl), /различается/);
  offer.bargainTerms.paymentPeriod = 'daily';
  assert.throws(() => parseHtml(stateHtml(offer), ownUrl), /Посуточное/);
  offer.bargainTerms.paymentPeriod = 'monthly';
  offer.bargainTerms.currency = 'usd';
  assert.throws(() => parseHtml(stateHtml(offer), ownUrl), /рублях/);
});
test('Unscoped price text is never used as the rent', () => {
  assert.throws(() => parseHtml('<h1>Квартира</h1><aside>26 000 ₽/мес.</aside>', url));
});

test('Selected metro stations are validated by city and passed as Cian IDs', async () => {
  const { cianSearchSchema, buildCianSearchUrl } = await import('@rent/shared');
  const criteria = cianSearchSchema.parse({ metroStations: [9, 116, 9], metroMinutes: 15 });
  const url = new URL(buildCianSearchUrl(criteria));
  assert.equal(url.searchParams.get('metro[0]'), '9');
  assert.equal(url.searchParams.get('metro[1]'), '116');
  assert.equal(url.searchParams.get('metro[2]'), null);
  assert.equal(url.searchParams.get('foot_min'), '15');
  assert.equal(cianSearchSchema.safeParse({ region: '2', metroStations: [9] }).success, false);
  assert.equal(cianSearchSchema.safeParse({ metroStations: [999999] }).success, false);
});
test('Metro matching uses any selected walking station and its own travel time', async () => {
  const { cianSearchSchema, searchMismatch, matchingMetroStops } = await import('@rent/shared');
  const l = listingSchema.parse({
    title: 'Квартира у метро',
    rent: 80000,
    metro: 'Аэропорт',
    metroMinutes: 4,
    metroStops: [
      { id: 9, name: 'Аэропорт', minutes: 4 },
      { id: 116, name: 'Сокол', minutes: 13 },
    ],
  });
  const s = cianSearchSchema.parse({ metroStations: [116], metroMinutes: 15 });
  assert.equal(searchMismatch(l, s), null);
  assert.equal(matchingMetroStops(l, s)[0].name, 'Сокол');
  assert.match(searchMismatch(l, { ...s, metroMinutes: 10 })!, /станций/);
  assert.equal(searchMismatch(l, { ...s, metroStations: [9, 116], metroMinutes: 5 }), null);
  assert.match(searchMismatch({ ...l, metroStops: [], metroMinutes: null }, s)!, /станций/);
});
test('Cian station extraction retains all walking routes and excludes driving routes', () => {
  const offer = structuredClone(offers[0]);
  offer.geo.undergrounds = [
    { id: 9, name: 'Аэропорт', travelType: 'transport', travelTime: 3 },
    { id: 116, name: 'Сокол', travelType: 'walk', travelTime: 13 },
  ];
  const l = parseHtml(stateHtml(offer), `https://www.cian.ru/rent/flat/${offer.id}/`).listings[0];
  assert.deepEqual(l.metroStops, [{ id: 116, name: 'Сокол', minutes: 13 }]);
});

for (const scenario of [
  'visible-start',
  'plain-403',
  'catalog-403',
  'captcha',
  'still-forbidden',
]) {
  test(`Background browser recovery: ${scenario}`, async () => {
    const { chromium } = await import('playwright');
    const { Importer } = require('../apps/api/dist/importer.js');
    const { Store } = require('../apps/api/dist/store.js');
    const original = chromium.launchPersistentContext;
    const modes: boolean[] = [],
      profiles: string[] = [];
    let closed = 0;
    chromium.launchPersistentContext = async (profile: string, options: any) => {
      modes.push(options.headless);
      profiles.push(profile);
      let current = url;
      const page = {
        on() {},
        setDefaultNavigationTimeout() {},
        url: () => current,
        async goto(u: string) {
          current = u;
          return { status: () => (options.headless || scenario === 'still-forbidden' ? 403 : 200) };
        },
        async waitForTimeout() {
          await new Promise((r) => setTimeout(r, 1));
        },
        async waitForFunction() {},
        async content() {
          return options.headless
            ? scenario === 'captcha'
              ? '<title>Вы не робот?</title>'
              : '<h1>403 Forbidden</h1>'
            : scenario === 'still-forbidden'
              ? '<h1>403 Forbidden</h1>'
              : current.includes('cat.php')
                ? `<a href="${url}">Квартира</a>`
                : fixture;
        },
      };
      return {
        route: async () => {},
        pages: () => [page],
        close: async () => {
          closed++;
        },
      } as any;
    };
    process.env.DATABASE_PATH = ':memory:';
    const store = new Store();
    try {
      const importer = new Importer(store);
      // Exercise recovery independently from the default visible launch mode.
      if (scenario !== 'visible-start') {
        const launch = importer.launchBrowser.bind(importer);
        let first = true;
        importer.launchBrowser = (state: any, headless: boolean) => {
          const mode = first ? true : headless;
          first = false;
          return launch(state, mode);
        };
      }
      const job = importer.start(
        scenario === 'catalog-403' ? 'https://www.cian.ru/cat.php?deal_type=rent&type=4' : url,
        1,
        1,
      );
      if (scenario !== 'visible-start') {
        for (let i = 0; i < 100 && !store.jobs()[0].canOpenBrowser; i++)
          await new Promise((r) => setTimeout(r, 5));
        assert.deepEqual(modes, [true]);
        assert.equal(store.jobs()[0].status, 'waiting');
        assert.throws(() => importer.openBrowser('wrong-id'));
        importer.openBrowser(job.id);
      }
      for (let i = 0; i < 100 && ['running', 'waiting'].includes(store.jobs()[0].status); i++)
        await new Promise((r) => setTimeout(r, 5));
      assert.deepEqual(modes, scenario === 'visible-start' ? [false] : [true, false]);
      if (scenario !== 'visible-start') assert.equal(profiles[0], profiles[1]);
      assert.equal(closed, scenario === 'visible-start' ? 1 : 2);
      assert.equal(store.jobs()[0].id, job.id);
      assert.equal(store.jobs()[0].count, scenario === 'still-forbidden' ? 0 : 1);
      if (scenario === 'still-forbidden') {
        assert.equal(store.jobs()[0].status, 'failed');
        assert.match(store.jobs()[0].message, /Сделайте паузу/);
      }
      assert.equal(store.jobs()[0].canOpenBrowser, false);
      assert.equal(store.all().length, scenario === 'still-forbidden' ? 0 : 1);
    } finally {
      chromium.launchPersistentContext = original;
      store.onModuleDestroy();
      delete process.env.DATABASE_PATH;
    }
  });
}
