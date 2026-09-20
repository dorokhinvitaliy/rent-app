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
