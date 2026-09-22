import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/search', (route) =>
    route.fulfill({ json: { count: 10, reason: 'enough', job: null } }),
  );
});
test('Desktop and mobile: demo, filtering, calculator, favorite, comparison, XLSX, manual create and HTML import', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // Clean the isolated test database; never touch the user's collection.
  const existing = await (await request.get('/api/listings')).json();
  for (const l of existing) await request.delete('/api/listings/' + l.id, { data: {} });
  await page.reload();
  await expect(page.getByText('У хорошего поиска есть свое место')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть демо · вымышленные цены' }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByLabel('Поиск по адресу или метро').fill('Ходынский');
  await expect(page.locator('.apartment-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'В избранное', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного' })).toBeVisible();
  await page.getByRole('button', { name: 'Подробнее и расчет' }).click();
  await expect(page.getByText('218 500 ₽', { exact: false }).last()).toBeVisible();
  await page.getByRole('dialog').screenshot({ path: 'test-results/calculator.png' });
  const term = page.getByRole('dialog').getByRole('combobox', { name: 'Планирую снимать' });
  await term.click();
  await page.getByRole('option', { name: '6 мес.', exact: true }).click();
  await expect(term).toHaveText('6 мес.');
  await term.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  const detailNote = page.getByRole('dialog');
  await expect(detailNote.getByRole('group', { name: /^Оценка / })).toBeVisible();
  await detailNote.locator('.detail-decision').scrollIntoViewIfNeeded();
  await detailNote.screenshot({ path: 'test-results/detail-decision-desktop.png' });
  await expect(detailNote.getByRole('textbox', { name: 'Быстрый комментарий' })).toHaveCount(0);
  await detailNote.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(detailNote.getByRole('textbox', { name: 'Быстрый комментарий' })).toBeVisible();
  await page.waitForTimeout(1200);
  const impression = detailNote.locator('.detail-decision');
  const cleanHeight = (await impression.boundingBox())!.height;
  await detailNote.getByRole('textbox', { name: 'Быстрый комментарий' }).fill('Уточнить счетчики');
  await expect
    .poll(async () => Math.abs((await impression.boundingBox())!.height - cleanHeight))
    .toBeLessThan(1);
  await detailNote.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
  await expect(
    detailNote.getByRole('button', { name: 'Сохранить комментарий', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => Math.abs((await impression.boundingBox())!.height - cleanHeight))
    .toBeLessThan(1);
  await expect(detailNote.getByRole('textbox', { name: 'Быстрый комментарий' })).toHaveValue(
    'Уточнить счетчики',
  );
  await expect(detailNote.getByRole('textbox', { name: 'Быстрый комментарий' })).toHaveValue(
    'Уточнить счетчики',
  );
  await detailNote
    .getByRole('textbox', { name: 'Быстрый комментарий' })
    .fill('Уточнить счетчики и залог');
  await detailNote.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
  await expect(detailNote.getByRole('textbox', { name: 'Быстрый комментарий' })).toHaveValue(
    'Уточнить счетчики и залог',
  );
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Поиск по адресу или метро').fill('');
  await page.getByLabel('Сравнить Светлая квартира у парка').check();
  await page.getByLabel('Сравнить Тихое место в центре').check();
  await page.getByRole('button', { name: 'Сравнить расходы' }).click();
  await expect(page.locator('.comparison')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Экспорт XLSX' }).click();
  expect((await downloaded).suggestedFilename()).toBe('mesto-apartments.xlsx');
  const pdfRequest = page.waitForRequest((req) => req.url().includes('/api/export.pdf'));
  const comparedPdf = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Экспорт PDF', exact: true }).click();
  expect(new URL((await pdfRequest).url()).searchParams.get('ids')?.split(',')).toHaveLength(2);
  expect((await comparedPdf).suggestedFilename()).toBe('mesto-apartments.pdf');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Снять выбор' }).click();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Добавить квартиру', exact: true })
    .click();
  await page.getByRole('button', { name: 'Вручную', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Моя тестовая квартира');
  await page.getByLabel('Аренда / месяц, ₽', { exact: true }).fill('50000');
  await page
    .getByLabel('Адрес', { exact: true })
    .fill('Москва, Западный административный округ, район Очаково-Матвеевское, длинный адрес дома');
  await page.getByRole('button', { name: 'Сохранить квартиру' }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(7);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Добавить квартиру', exact: true })
    .click();
  await page.getByRole('button', { name: 'HTML-файл' }).click();
  await page
    .getByPlaceholder('https://www.cian.ru/rent/flat/…')
    .fill('https://www.cian.ru/rent/flat/123456789/');
  await page.locator('input[type=file]').setInputFiles(resolve('tests/fixtures/cian-detail.html'));
  await page.getByRole('button', { name: 'Импортировать', exact: true }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(8);
  const galleryLabel = await page
    .locator('.apartment-card')
    .filter({ has: page.locator('.photo-count', { hasText: '1 / 2' }) })
    .first()
    .locator('.image-open')
    .getAttribute('aria-label');
  const gallery = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: galleryLabel!, exact: true }) });
  await gallery.locator('.card-image').scrollIntoViewIfNeeded();
  const photoBox = await gallery.locator('.card-image').boundingBox();
  await page.mouse.move(photoBox!.x + photoBox!.width * 0.8, photoBox!.y + photoBox!.height / 2);
  await expect(gallery.locator('.photo-count')).toHaveText('2 / 2');
  await page.mouse.move(photoBox!.x + photoBox!.width * 0.1, photoBox!.y + photoBox!.height / 2);
  await expect(gallery.locator('.photo-count')).toHaveText('1 / 2');
  await gallery.locator('.image-open').focus();
  await page.keyboard.press('ArrowRight');
  await expect(gallery.locator('.photo-count')).toHaveText('2 / 2');
  await page.mouse.move(0, 0);
  await expect(gallery.locator('.photo-count')).toHaveText('1 / 2');
  await expect(gallery.locator('.card-photo-prev, .card-photo-next')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Подробнее и расчет' }).first().click();
  await expect(page.locator('.detail-finances')).toBeVisible();
  await page.getByRole('dialog').screenshot({ path: 'test-results/mobile-detail.png' });
  await page.getByRole('dialog').getByRole('combobox', { name: 'Планирую снимать' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-select.png', animations: 'disabled' });
  await page.getByRole('option', { name: '3 мес.', exact: true }).click();
  expect(errors).toEqual([]);
});

test('Parameter search submits criteria, shows progress and isolates results from previous listings', async ({
  page,
}) => {
  let submitted: any;
  let job: any;
  let opened = false;
  await page.route('**/api/imports/search-e2e/open-browser', (route) => {
    opened = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/search/cian', async (route) => {
    submitted = route.request().postDataJSON();
    job = {
      id: 'search-e2e',
      url: 'https://www.cian.ru/cat.php?deal_type=rent&type=4',
      status: 'waiting',
      canOpenBrowser: true,
      message: 'Пройдите проверку в открывшемся браузере',
      count: 0,
      scanned: 0,
      skipped: 0,
      warnings: [],
      listingIds: [],
      search: submitted,
      createdAt: new Date().toISOString(),
    };
    await route.fulfill({ json: job });
  });
  await page.route('**/api/imports', (route) => route.fulfill({ json: job ? [job] : [] }));
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Поиск квартир на Циане' });
  const minPrice = panel.getByLabel('Аренда в месяц, ₽ от', { exact: true });
  await minPrice.focus();
  expect(await minPrice.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('none');
  expect(await minPrice.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
  await expect(minPrice.locator('xpath=../../..')).toHaveCSS('border-color', 'rgb(37, 38, 41)');
  await page.keyboard.press('Tab');
  await expect(panel.getByLabel('Аренда в месяц, ₽ до', { exact: true })).toBeFocused();
  await panel.getByRole('combobox', { name: 'Город', exact: true }).click();
  await page.getByRole('option', { name: 'Санкт-Петербург', exact: true }).click();
  await panel.getByLabel('Аренда в месяц, ₽ до').fill('90000');
  await panel.getByLabel('Площадь, м² от').fill('40');
  await panel.getByLabel('Площадь, м² до').fill('70');
  await panel.getByRole('combobox', { name: 'Пешком до метро' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.screenshot({ path: 'test-results/custom-select.png', animations: 'disabled' });
  await page.getByRole('option', { name: 'До 10 минут', exact: true }).click();
  await panel.getByRole('button', { name: '2', exact: true }).click();
  await panel.getByRole('checkbox', { name: 'Без комиссии' }).check();
  await expect(panel.getByRole('checkbox', { name: 'Без комиссии' })).toHaveCSS(
    'appearance',
    'none',
  );
  const preview = await panel
    .getByRole('link', { name: 'Посмотреть поиск на Циане' })
    .getAttribute('href');
  expect(new URL(preview!).searchParams.get('mintarea')).toBe('40');
  await panel.getByRole('button', { name: 'Найти квартиры' }).click();
  expect(submitted).toBeUndefined();
  await page.getByRole('button', { name: 'Ещё загрузить с Циана' }).click();
  expect(submitted).toMatchObject({
    region: '2',
    rooms: [2],
    maxRent: 90000,
    minArea: 40,
    maxArea: 70,
    metroMinutes: 10,
    noCommission: true,
  });
  await expect(page.getByText('Нужна проверка на Циане', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ещё загрузить с Циана' })).toBeDisabled();
  await page.getByRole('button', { name: 'Открыть окно проверки' }).click();
  await expect.poll(() => opened).toBe(true);
  await expect(page.locator('.apartment-card')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Сбросить условия', exact: true }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(8);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/search-mobile.png' });
});

test('Metro multi-selection supports search, removal, city reset and persisted search criteria', async ({
  page,
}) => {
  let submitted: any;
  await page.route('**/api/search/cian', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: 'metro-test',
        status: 'completed',
        message: 'Готово',
        count: 0,
        scanned: 0,
        warnings: [],
        listingIds: [],
        search: submitted,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Желаемые станции метро' }).click();
  const query = page.getByRole('searchbox', { name: 'Найти станцию метро' });
  await query.fill('Аэропорт');
  await query.press('Enter');
  expect(submitted).toBeUndefined();
  await page.getByRole('checkbox', { name: 'Аэропорт', exact: true }).check();
  await query.fill('Сокол');
  await page.getByRole('checkbox', { name: 'Сокол', exact: true }).check();
  await expect(page.locator('.home-search .metro-summary-stations')).toContainText(',');
  await expect(page.locator('.home-search .metro-summary-stations')).toHaveCSS(
    'white-space',
    'nowrap',
  );
  await query.fill('');
  await page.getByRole('button', { name: 'Выбранные' }).click();
  await page.getByRole('checkbox', { name: 'Аэропорт', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Аэропорт', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Сокол', exact: true })).toBeChecked();
  await page.screenshot({ path: 'test-results/metro-picker.png' });
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Желаемые станции метро' })).toBeFocused();
  await page.getByRole('button', { name: 'Найти квартиры', exact: true }).click();
  await page.getByRole('button', { name: 'Ещё загрузить с Циана', exact: true }).click();
  await expect.poll(() => submitted?.metroStations).toEqual([116]);
  await page.reload();
  await expect(page.locator('.metro-trigger-copy')).toContainText('Сокол');
  await page.getByRole('combobox', { name: 'Город', exact: true }).click();
  await page.getByRole('option', { name: 'Санкт-Петербург', exact: true }).click();
  await expect(page.locator('.metro-trigger-copy')).toContainText('Выберите станции');
  await page.getByRole('button', { name: 'Желаемые станции метро' }).click();
  await page.getByRole('searchbox', { name: 'Найти станцию метро' }).fill('Автово');
  await page.getByRole('checkbox', { name: 'Автово', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.metro-popover').screenshot({ path: 'test-results/metro-picker-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Выбор станций метро' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Желаемые станции метро' }).click();
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Автово', exact: true })).not.toBeChecked();
});

test('Personal ratings persist, sort listings and refresh an individual source listing', async ({
  page,
  request,
}) => {
  await request.post('/api/imports/html', {
    data: {
      url: 'https://www.cian.ru/rent/flat/123456789/',
      html: readFileSync(resolve('tests/fixtures/cian-detail.html'), 'utf8'),
    },
  });
  const rows = await (await request.get('/api/listings')).json();
  const sourced = rows.find((l: any) => l.url && !l.demo && l.source === 'cian');
  await page.goto('/');
  const card = page.locator('.apartment-card').filter({
    has: page.getByRole('button', { name: 'Актуализировать ' + sourced.title, exact: true }),
  });
  await card.locator('.card-title').hover();
  await expect(card.locator('.rating-popover')).toBeHidden();
  await card.locator('.rating-summary').hover();
  await card.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(card.locator('.rating-summary')).toHaveAttribute('title', 'Нравится');
  await card.locator('.rating-summary').hover();
  await expect(card.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await card.locator('.card-title').hover();
  await expect(card.locator('.rating-popover')).toBeHidden();
  await card.locator('.rating-summary').hover();
  await expect(card.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('combobox', { name: 'Сортировка', exact: true }).click();
  await page.getByRole('option', { name: 'Оценка: по убыванию', exact: true }).click();
  await expect(page.locator('.apartment-card').first().locator('.rating-summary')).toHaveAttribute(
    'title',
    'Нравится',
  );
  let refreshed = false;
  await page.clock.install();
  let refreshStatus = 'running';
  await page.route('**/api/imports', (route) =>
    route.fulfill({
      json: refreshed
        ? [
            {
              id: 'refresh-test',
              url: sourced.url,
              status: refreshStatus,
              count: refreshStatus === 'done' ? 1 : 0,
              warnings: [],
              message: 'Добавлено новых: 0. Обновлено: 1.',
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
    }),
  );
  await page.route('**/api/listings/' + sourced.id + '/refresh', (route) => {
    refreshed = true;
    return route.fulfill({
      json: { id: 'refresh-test', url: sourced.url, status: 'running', count: 0, warnings: [] },
    });
  });
  await card.getByRole('button', { name: 'Актуализировать ' + sourced.title, exact: true }).click();
  await expect.poll(() => refreshed).toBe(true);
  const toast = page.locator('.search-toast');
  await expect(toast).toContainText('Обновляю объявление…');
  await expect(toast).toContainText(sourced.title);
  await expect(toast).not.toContainText('Ищу подходящие квартиры');
  await card.getByRole('button', { name: 'Подробнее и расчет' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Добавлено новых');
  refreshStatus = 'done';
  await page.clock.runFor(4100);
  await expect(toast).toContainText('Объявление обновлено', { timeout: 7000 });
  await expect(toast).not.toContainText('Добавлено новых');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await card.screenshot({ path: 'test-results/rating-card.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await card.getByRole('button', { name: 'Оценить ' + sourced.title, exact: true }).click();
  await page.clock.runFor(500);
  await page.waitForTimeout(650);
  await card.getByRole('button', { name: 'Думаю', exact: true }).hover();
  await expect(card.locator('.rating-explanation')).toHaveText('Думаю');
  await page.waitForTimeout(250);
  await card.screenshot({ path: 'test-results/rating-expanded.png', animations: 'disabled' });
  await page.screenshot({ path: 'test-results/rating-thermometer-mobile.png' });
  await card.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Оценить ' + sourced.title, exact: true }),
  ).toHaveAttribute('title', 'Оценить вариант');
  await page.keyboard.press('Escape');
  await expect(card.locator('.rating-popover')).toBeHidden();
});

test('Rating one archives without deleting, survives reimport and can be restored', async ({
  page,
  request,
}) => {
  const url = 'https://www.cian.ru/rent/flat/123456789/';
  const html = readFileSync(resolve('tests/fixtures/cian-detail.html'), 'utf8');
  await request.post('/api/imports/html', { data: { url, html } });
  const rows = await (await request.get('/api/listings')).json();
  const listing = rows.find((l: any) => l.url === url);
  await request.patch('/api/listings/' + listing.id, { data: { rating: null } });
  await page.goto('/');
  const card = page.locator('.apartment-card').filter({
    has: page.getByRole('button', { name: 'Актуализировать ' + listing.title, exact: true }),
  });
  await card.locator('.rating-summary').hover();
  await card.getByRole('button', { name: 'Точно нет', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Объявление в архиве' })).toBeVisible();
  await page.reload();
  await expect(card).toHaveCount(0);
  await request.post('/api/imports/html', { data: { url, html } });
  const saved = (await (await request.get('/api/listings')).json()).find(
    (l: any) => l.id === listing.id,
  );
  expect(saved.rating).toBe(1);
  await page.getByRole('button', { name: /^Архив/ }).click();
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Вернуть в подборку', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Все квартиры/ })
    .click();
  await expect(card).toHaveCount(1);
  await page.reload();
  await expect(card).toHaveCount(1);
});

test('Rating updates only its card without refetching or disabling other cards', async ({
  page,
  request,
}) => {
  const first = await (
    await request.post('/api/listings', {
      data: { title: 'Проверка точечной оценки', rent: 60000 },
    })
  ).json();
  const second = await (
    await request.post('/api/listings', {
      data: { title: 'Соседняя карточка без изменений', rent: 65000 },
    })
  ).json();
  await page.goto('/');
  const card = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: first.title, exact: true }) });
  const neighbor = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: second.title, exact: true }) });
  await expect(neighbor).toBeVisible();
  // Block the scheduled poll so only rating-triggered fetches are counted.
  await page.evaluate(() => {
    for (let id = 1; id < 1000; id++) window.clearInterval(id);
  });
  let listFetches = 0;
  page.on('request', (r) => {
    if (r.method() === 'GET' && /\/api\/(listings|imports)$/.test(r.url())) listFetches++;
  });
  await neighbor.evaluate((el) => {
    (window as any).neighborMutations = 0;
    new MutationObserver((records) => {
      (window as any).neighborMutations += records.length;
    }).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/listings/' + first.id, async (route) => {
    await gate;
    await route.continue();
  });
  await card.locator('.rating-summary').hover();
  await card.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Нравится', exact: true, includeHidden: true }),
  ).toBeDisabled();
  await expect(neighbor.getByRole('checkbox')).toBeEnabled();
  await expect(neighbor.locator('.three-rating-clear')).toHaveCount(0);
  expect(await neighbor.locator('.rating-options button:disabled').count()).toBe(0);
  release();
  await expect(card.locator('.rating-summary')).toHaveAttribute('title', 'Нравится');
  expect(listFetches).toBe(0);
  expect(await page.evaluate(() => (window as any).neighborMutations)).toBe(0);
});

test('Apartment ranking orders rated listings, shares places and responds to rating changes', async ({
  page,
  request,
}) => {
  for (const [name, rent, rating] of [
    ['Лидер', 80000, 5],
    ['Доступный', 50000, 5],
    ['Запасной', 60000, 3],
    ['Без оценки', 40000, null],
    ['Отклонённый', 30000, 1],
  ] as const) {
    const l = await (
      await request.post('/api/listings', { data: { title: 'Рейтинг тест ' + name, rent } })
    ).json();
    await request.patch('/api/listings/' + l.id, { data: { rating } });
  }
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Рейтинг/ })
    .click();
  await page.getByRole('textbox', { name: 'Поиск по адресу или метро' }).fill('Рейтинг тест');
  const cards = page.locator('.apartment-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.card-title')).toHaveText([
    'Рейтинг тест Доступный',
    'Рейтинг тест Лидер',
    'Рейтинг тест Запасной',
  ]);
  expect(await cards.nth(0).locator('.ranking-badge b').innerText()).toBe(
    await cards.nth(1).locator('.ranking-badge b').innerText(),
  );
  const reserve = cards.filter({ hasText: 'Рейтинг тест Запасной' });
  await reserve.locator('.rating-summary').hover();
  await reserve.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(cards.locator('.card-title')).toHaveText([
    'Рейтинг тест Доступный',
    'Рейтинг тест Запасной',
    'Рейтинг тест Лидер',
  ]);
  await reserve.locator('.rating-summary').hover();
  await reserve.getByRole('button', { name: 'Точно нет', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/ranking-mobile.png', fullPage: true });
});

test('Card notes expand on hover and tap without opening the apartment', async ({
  page,
  request,
}) => {
  const notes =
    'Хорошая планировка, уточнить условия залога.\n' +
    'Обсудить с собственником мебель и дату въезда. '.repeat(40);
  const listing = await (
    await request.post('/api/listings', {
      data: { title: 'Квартира с личной заметкой', rent: 55000 },
    })
  ).json();
  await request.patch('/api/listings/' + listing.id, { data: { notes } });
  await page.goto('/');
  const card = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: listing.title, exact: true }) });
  const trigger = card.getByRole('button', { name: 'Моя заметка', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.hover();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('region', { name: 'Текст заметки' })).toHaveText(notes);
  expect(
    await card.locator('.card-note-text').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/card-note-desktop.png', fullPage: true });
  await card.locator('.card-title').hover();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await card.screenshot({ path: 'test-results/card-note-mobile.png' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await request.patch('/api/listings/' + listing.id, { data: { notes: '' } });
  await page.reload();
  await expect(card.locator('.card-note:not(.note-composer)')).toHaveCount(0);
});

test('Quick comment saves inline, retains failed drafts and persists after reload', async ({
  page,
  request,
}) => {
  const listing = await (
    await request.post('/api/listings', {
      data: { title: 'Быстрый комментарий тест', address: 'Москва', rent: 50000 },
    })
  ).json();
  await page.goto('/');
  const card = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: listing.title, exact: true }) });
  await card.hover();
  await card.getByRole('button', { name: 'Добавить комментарий', exact: true }).click();
  const field = card.getByRole('textbox', { name: 'Быстрый комментарий' });
  await expect(field).toBeFocused();
  await expect(
    card.getByRole('button', { name: 'Сохранить комментарий', exact: true }),
  ).toBeDisabled();
  await field.fill('Уточнить про кота и залог');
  await page.route('**/api/listings/' + listing.id, (route) =>
    route.fulfill({ status: 500, json: { message: 'Не удалось сохранить' } }),
  );
  await card.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveText('Не удалось сохранить');
  await expect(field).toHaveValue('Уточнить про кота и залог');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Добавить комментарий', exact: true }).click();
  await expect(field).toHaveValue('Уточнить про кота и залог');
  await page.unroute('**/api/listings/' + listing.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await card.screenshot({ path: 'test-results/quick-note-mobile.png' });
  await card.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Моя заметка', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(card.locator('.card-note-preview')).toHaveText('Уточнить про кота и залог');
});

test('Detail modal navigates apartments and photos independently and preserves note drafts', async ({
  page,
  request,
}) => {
  for (const name of ['Первый', 'Второй'])
    await request.post('/api/listings', {
      data: {
        title: 'Навигация модалки ' + name,
        description: 'Светлая квартира, удобная планировка и тихие соседи. '.repeat(25),
        rent: 70000,
        photos: ['https://photos.test/1.jpg', 'https://photos.test/2.jpg'],
      },
    });
  await page.route('https://photos.test/**', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c7b9a4"/></svg>',
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Поиск по адресу или метро' }).fill('Навигация модалки');
  const cards = page.locator('.apartment-card');
  const firstTitle = await cards.first().locator('.card-title').innerText();
  await cards.first().getByRole('button', { name: 'Подробнее и расчет', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(firstTitle);
  await dialog.getByRole('button', { name: 'Ещё…', exact: true }).click();
  await expect(dialog.locator('.detail-description p')).toHaveClass('expanded');
  await dialog.getByRole('button', { name: 'Свернуть', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Предыдущее объявление', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Следующее фото', exact: true }).click();
  await expect(dialog.locator('.detail-photo-count')).toHaveText('2 / 2');
  await page.waitForTimeout(500);
  await dialog
    .locator('.detail-decision')
    .screenshot({ path: 'test-results/empty-impression.png' });
  await dialog.getByRole('button', { name: 'Добавить комментарий', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Быстрый комментарий' }).fill('Заметка без оценки');
  await expect(dialog.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await dialog.getByRole('textbox', { name: 'Быстрый комментарий' }).fill('');
  const favoriteBefore = (await (await request.get('/api/listings')).json()).find(
    (row: any) => row.title === firstTitle,
  ).favorite;
  await dialog.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/listings')).json()).find(
          (row: any) => row.title === firstTitle,
        ).rating,
    )
    .toBe(5);
  expect(
    (await (await request.get('/api/listings')).json()).find((row: any) => row.title === firstTitle)
      .favorite,
  ).toBe(favoriteBefore);
  const notes = dialog.getByRole('textbox', { name: 'Быстрый комментарий' });
  await notes.fill('Черновик для первой квартиры');
  await dialog.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/listings')).json()).find(
          (row: any) => row.title === firstTitle,
        ).rating,
    )
    .toBe(null);
  await expect(notes).toHaveValue('Черновик для первой квартиры');
  await dialog.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.locator('.detail-info').evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(500);
  await dialog.screenshot({ path: 'test-results/photo-widget-desktop.png' });
  await dialog.getByRole('button', { name: 'Следующее объявление', exact: true }).click();
  await expect(dialog.getByRole('heading', { level: 2 })).not.toHaveText(firstTitle);
  await expect(dialog.locator('.detail-photo-count')).toHaveText('1 / 2');
  await expect(notes).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Предыдущее объявление', exact: true }).click();
  await expect(notes).toHaveValue('Черновик для первой квартиры');
  await notes.fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await notes.fill('Уточнить залог, коммунальные платежи и возможность заезда в выходные.');
  const dock = dialog.locator('.detail-media-dock');
  await expect(dock).toBeInViewport();
  await expect(
    dialog.getByRole('button', { name: 'Сохранить комментарий', exact: true }),
  ).toBeInViewport();
  await page.waitForTimeout(750);
  await dialog.screenshot({ path: 'test-results/photo-widget-mobile.png' });
  const mediaBounds = await dialog.locator('.detail-media').boundingBox();
  const dockBounds = await dock.boundingBox();
  expect(dockBounds!.y).toBeGreaterThan(mediaBounds!.y + 48);
  expect(dockBounds!.y + dockBounds!.height).toBeLessThanOrEqual(
    mediaBounds!.y + mediaBounds!.height,
  );
  await notes.fill('');
  await expect(
    dialog.getByRole('button', { name: 'Следующее объявление', exact: true }),
  ).toBeInViewport();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('Checkbox selection saves new and existing collections and removes only membership', async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const l = await (
      await request.post('/api/listings', {
        data: { title: 'Подборки тест ' + i, address: 'Москва', rent: 60000 },
      })
    ).json();
    ids.push(l.id);
  }
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Поиск по адресу или метро' }).fill('Подборки тест');
  const cards = page.locator('.apartment-card');
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < 5; i++) await cards.nth(i).getByRole('checkbox').check();
  await expect(cards.first()).toHaveCSS('outline-style', 'solid');
  await expect(page.getByRole('button', { name: 'Сравнить расходы', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'В подборку', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Новая подборка', { exact: true }).check();
  await modal.getByRole('textbox', { name: 'Название подборки' }).fill('Посмотреть в выходные');
  await modal.getByRole('button', { name: 'Создать подборку', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Подборки/ })
    .click();
  await expect(cards).toHaveCount(5);
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Подборки/ })
    .click();
  await expect(cards).toHaveCount(5);
  await cards.first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Убрать из подборки', exact: true }).click();
  await expect(cards).toHaveCount(4);
  expect(
    (await (await request.get('/api/listings')).json()).filter((l: any) => ids.includes(l.id)),
  ).toHaveLength(5);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Все квартиры/ })
    .click();
  await page.getByRole('textbox', { name: 'Поиск по адресу или метро' }).fill('Подборки тест');
  for (let i = 0; i < 5; i++) await cards.nth(i).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'В подборку', exact: true }).click();
  await modal.getByRole('radio', { name: /Посмотреть в выходные/ }).check();
  await modal.getByRole('button', { name: 'Добавить в подборку', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Подборки/ })
    .click();
  await expect(cards).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/collections-mobile.png', fullPage: true });
});

test('Photo morph preserves image proportions and does not stretch modal text', async ({
  page,
  request,
}) => {
  await request.post('/api/listings', {
    data: {
      title: 'Проверка morph перехода',
      rent: 65000,
      photos: ['https://morph.test/photo.svg'],
    },
  });
  await page.route('https://morph.test/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c7b9a4"/></svg>',
    }),
  );
  await page.goto('/');
  const card = page
    .locator('.apartment-card')
    .filter({ has: page.getByRole('button', { name: 'Проверка morph перехода', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await card.locator('.image-open img').evaluate((el: HTMLImageElement) => el.decode());
  const origin = await card.locator('.card-image').boundingBox();
  await card.getByRole('button', { name: 'Подробнее и расчет', exact: true }).click();
  const geometry = await page.locator('.detail-photo-morph').evaluate(async (el) => {
    const animations = el.getAnimations({ subtree: true });
    animations.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    await new Promise(requestAnimationFrame);
    const start = el.getBoundingClientRect().toJSON();
    animations.forEach((a) => (a.currentTime = 160));
    await new Promise(requestAnimationFrame);
    const middle = el.getBoundingClientRect().toJSON();
    const image = el.querySelector('img')!.getBoundingClientRect();
    const target = document.querySelector('.detail-media')!.getBoundingClientRect().toJSON();
    const panelTransform = getComputedStyle(document.querySelector('.listing-panel')!).transform;
    animations.forEach((a) => a.play());
    return { start, middle, target, ratio: image.width / image.height, panelTransform };
  });
  expect(geometry.start.x).toBeCloseTo(origin!.x, 0);
  expect(geometry.start.width).toBeCloseTo(origin!.width, 0);
  expect(geometry.middle.width).toBeGreaterThan(geometry.start.width);
  expect(geometry.middle.width).toBeLessThan(geometry.target.width);
  expect(geometry.ratio).toBeCloseTo(1.5, 2);
  expect(geometry.panelTransform).toBe('none');
  await expect(page.locator('.detail-photo-morph')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.getByRole('button', { name: 'Подробнее и расчет', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.detail-photo-morph')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Browser crash toast stays compact and hides Chromium diagnostics', async ({ page }) => {
  await page.route('**/api/imports', (route) =>
    route.fulfill({
      json: [
        {
          id: 'crash',
          status: 'failed',
          url: 'https://www.cian.ru/',
          count: 0,
          warnings: [],
          createdAt: new Date().toISOString(),
          message:
            'browserType.launchPersistentContext: Target page, context closed\n' +
            '--disable-features '.repeat(500),
        },
      ],
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toast = page.locator('.search-toast');
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText('launchPersistentContext');
  await expect(toast).toContainText('Попробуйте ещё раз');
  const box = await toast.boundingBox();
  expect(box!.height).toBeLessThan(180);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/search-error-toast.png' });
  await page.getByRole('button', { name: 'Закрыть поиск', exact: true }).click();
  await expect(toast).toHaveCount(0);
});

test('Search groups expose apartment criteria without parser settings', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Поиск квартир на Циане' });
  for (const label of ['Расположение', 'Квартира', 'Бюджет'])
    await expect(panel.getByRole('region', { name: label, exact: true })).toBeVisible();
  await expect(panel.getByText('Собрать до', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Просмотреть до', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Еще параметры', { exact: true })).toHaveCount(0);
  await panel.screenshot({ path: 'test-results/search-redesign-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: 'test-results/search-redesign-mobile.png' });
});

test('Sticky search shares criteria and navigation can collapse persistently', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Быстрый поиск квартир' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ещё загрузить с Циана' }).scrollIntoViewIfNeeded();
  const compact = page.getByRole('form', { name: 'Быстрый поиск квартир' });
  await expect(compact).toBeVisible();
  await compact.getByRole('combobox', { name: 'Количество комнат' }).click();
  const rooms = page.getByRole('listbox', { name: 'Количество комнат' });
  await rooms.getByRole('option', { name: 'Студия', exact: true }).click();
  await rooms.getByRole('option', { name: '2 комн.', exact: true }).click();
  await expect(rooms.getByRole('option', { name: 'Студия', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(rooms.getByRole('option', { name: '2 комн.', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: 'test-results/room-select.png' });
  await page.keyboard.press('Escape');
  await expect(rooms).toBeHidden();
  await compact.getByRole('spinbutton', { name: 'Аренда до', exact: true }).fill('95000');
  await expect(page.getByLabel('Аренда в месяц, ₽ до', { exact: true })).toHaveValue('95000');
  await page.screenshot({ path: 'test-results/compact-header-desktop.png' });
  await page.getByRole('button', { name: 'Скрыть навигацию' }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.reload();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Показать навигацию' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Ещё загрузить с Циана' }).scrollIntoViewIfNeeded();
  await expect(compact).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/compact-header-mobile.png' });
  await compact.getByRole('button', { name: 'Все условия поиска' }).click();
  await expect(compact).toHaveCount(0);
});

test('Members cannot open manual creation or shared listing editing', async ({ page, request }) => {
  const created = await (
    await request.post('/api/listings', {
      data: {
        title: 'Проверка прав участника',
        rent: 50000,
        source: 'cian',
        url: 'https://www.cian.ru/rent/flat/123456780/',
      },
    })
  ).json();
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'member-ui', name: 'Участник', email: 'member@example.test', role: 'member' },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить квартиру', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Вручную', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'HTML-файл', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'В браузере', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Открыть Проверка прав участника', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0);
  await request.delete('/api/listings/' + created.id, { data: {} });
});

test('Rich details, personal viewing feedback and collection PDF download', async ({
  page,
  request,
}) => {
  const listing = await (
    await request.post('/api/listings', {
      data: {
        title: 'Квартира для просмотра',
        rent: 75000,
        address: 'Москва, улица Тестовая, 5',
        details: {
          sections: [{ title: 'О доме', items: [{ label: 'Год постройки', value: '2024' }] }],
          amenities: { hasFridge: true },
          contact: { name: 'Тестовый агент', role: 'agent', phones: ['+79990000000'], relay: true },
          checkedAt: new Date().toISOString(),
        },
      },
    })
  ).json();
  await request.post('/api/collections', {
    data: { name: 'PDF для просмотра', listingIds: [listing.id] },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть Квартира для просмотра', exact: true }).click();
  const modal = page.getByRole('dialog');
  const fullDownload = page.waitForEvent('download');
  const fullRequest = page.waitForRequest((req) => req.url().includes('/api/export.pdf'));
  await modal.getByRole('button', { name: 'Скачать подробный PDF объявления' }).click();
  expect(new URL((await fullRequest).url()).searchParams.get('detailed')).toBe('1');
  await (await fullDownload).saveAs('test-results/full-listing.pdf');
  expect(readFileSync('test-results/full-listing.pdf').subarray(0, 5).toString()).toBe('%PDF-');
  await expect(modal.getByRole('link', { name: '+7 999 000-00-00' })).toHaveAttribute(
    'href',
    'tel:+79990000000',
  );
  await expect(modal.locator('.detail-memberships')).toContainText('PDF для просмотра');
  await expect(modal.getByRole('group', { name: 'Оценка Квартира для просмотра' })).toBeVisible();
  await expect(modal.getByText('Моя оценка', { exact: true })).toBeHidden();
  await modal.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Нравится', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'В подборках · 1', exact: true }).click();
  const picker = page.locator('dialog.modal');
  await expect(picker.getByText('Уже в этой подборке')).toBeVisible();
  await picker.getByLabel('Новая подборка', { exact: true }).check();
  await picker.getByLabel('Название подборки').fill('Понравилось на просмотре');
  await picker.getByRole('button', { name: 'Создать подборку', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(modal.locator('.detail-memberships')).toContainText('Понравилось на просмотре');
  await expect(modal.getByRole('button', { name: 'В подборках · 2', exact: true })).toBeVisible();
  await modal.locator('.property-section summary').click();
  await expect(modal.getByText('2024', { exact: true })).toBeVisible();
  await expect(modal.getByText('Холодильник', { exact: true })).toBeVisible();
  await modal.screenshot({ path: 'test-results/rich-details.png' });
  await modal.getByRole('button', { name: 'Запланировать просмотр', exact: true }).click();
  await modal.getByRole('button', { name: 'Выбрать дату просмотра', exact: true }).click();
  await modal
    .locator('.viewing-calendar')
    .screenshot({ path: 'test-results/viewing-calendar.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await modal
    .locator('.viewing-widget')
    .screenshot({ path: 'test-results/viewing-widget-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await modal.getByRole('button', { name: 'Завтра', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Часы просмотра' }).click();
  await page.getByRole('option', { name: '18', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Минуты просмотра' }).click();
  await page.getByRole('option', { name: '30', exact: true }).click();
  await modal
    .getByRole('region', { name: 'Просмотр квартиры', exact: true })
    .getByRole('button', { name: 'Добавить заметку', exact: true })
    .click();
  await page.getByLabel('Фидбэк о просмотре').fill('Уточнить парковку, понравился вид');
  await page.getByRole('button', { name: 'Сохранить просмотр', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Изменить просмотр', exact: true })).toContainText(
    '18:30',
  );
  await modal.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.detail-photo-morph')).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Просмотры/ })
    .click();
  await expect(page.locator('.viewing-card')).toHaveCount(1);
  await expect(page.locator('.viewing-card')).toContainText('Уточнить парковку');
  await page.locator('.viewing-edit').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Фидбэк о просмотре').fill('После встречи: тихий двор, уточнить договор');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.viewing-card')
    .screenshot({ path: 'test-results/viewing-inline-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page
    .getByRole('group', { name: 'Статус просмотра' })
    .getByRole('button', { name: 'Состоялся', exact: true })
    .click();
  await page.getByRole('button', { name: 'Сохранить просмотр', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.viewing-inline-editor')).toHaveCount(0);
  await expect(page.locator('.viewing-status')).toHaveText('Состоялся');
  await expect(page.locator('.viewing-card')).toContainText('После встречи: тихий двор');
  await page.screenshot({ path: 'test-results/viewings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/viewings-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Подборки/ })
    .click();
  await page.getByRole('button', { name: /PDF для просмотра/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт PDF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('test-results/collection-ui.pdf');
  expect(readFileSync('test-results/collection-ui.pdf').subarray(0, 5).toString()).toBe('%PDF-');
});

test('Collection review visits only unrated apartments and advances after persisted ratings', async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const l = await (
      await request.post('/api/listings', {
        data: { title: 'Оценить последовательно ' + i, rent: 60000 },
      })
    ).json();
    ids.push(l.id);
  }
  await request.patch('/api/listings/' + ids[0], { data: { rating: 5 } });
  await request.post('/api/collections', {
    data: { name: 'Последовательная оценка', listingIds: ids },
  });
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Подборки/ })
    .click();
  await page.getByRole('button', { name: /Последовательная оценка/ }).click();
  await page.getByRole('button', { name: 'Оценить объявления подборки', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toHaveAttribute('aria-label', 'Оценить последовательно 1');
  await expect(modal).toContainText('Оценка подборки · 1 из 2');
  await modal.getByRole('button', { name: 'Точно нет', exact: true }).click();
  await expect(modal).toHaveAttribute('aria-label', 'Оценить последовательно 2');
  await expect(modal).toContainText('Оценка подборки · 2 из 2');
  await modal.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Оценить объявления подборки', exact: true }),
  ).toBeDisabled();
  const rows = await (await request.get('/api/listings')).json();
  expect(ids.map((id) => rows.find((l: any) => l.id === id).rating)).toEqual([5, 1, 5]);
});

test('Guests export the filtered results to PDF without logging in', async ({
  browser,
  request,
}) => {
  const listing = await (
    await request.post('/api/listings', {
      data: {
        title: 'PDF guest scope',
        address: 'Уникальный PDF адрес',
        rent: 52000,
      },
    })
  ).json();
  await request.patch('/api/listings/' + listing.id, { data: { notes: 'PRIVATE_PDF_COMMENT' } });
  await request.post('/api/viewings', {
    data: {
      listingId: listing.id,
      startsAt: '2026-10-01T15:00:00Z',
      feedback: 'PRIVATE_PDF_VIEWING',
    },
  });
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Поиск по адресу или метро').fill('Уникальный PDF адрес');
  await expect(page.locator('.apartment-card')).toHaveCount(1);
  const requestPromise = page.waitForRequest((req) => req.url().includes('/api/export.pdf'));
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт PDF', exact: true }).click();
  expect(new URL((await requestPromise).url()).searchParams.get('ids')).toBe(listing.id);
  await (await file).saveAs('test-results/guest-filtered.pdf');
  expect(readFileSync('test-results/guest-filtered.pdf').subarray(0, 5).toString()).toBe('%PDF-');
  await context.close();
});

test('Archiving from the detail modal keeps listing navigation usable', async ({
  page,
  request,
}) => {
  for (let i = 0; i < 3; i++) {
    await request.post('/api/listings', {
      data: {
        title: 'Навигация после архива ' + i,
        address: 'Тест архива модалки',
        rent: 60000 + i,
      },
    });
  }
  await page.goto('/');
  await page.getByLabel('Поиск по адресу или метро').fill('Тест архива модалки');
  const cards = page.locator('.apartment-card');
  await expect(cards).toHaveCount(3);
  const titles = await cards
    .getByRole('button', { name: /^Открыть Навигация после архива/ })
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')!.replace('Открыть ', '')),
    );
  await cards.first().getByRole('button', { name: 'Подробнее и расчет', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Следующее объявление', exact: true }).click();
  await expect(modal).toHaveAttribute('aria-label', titles[1]);
  const archiveCurrent = async () => {
    await modal.getByRole('button', { name: 'Точно нет', exact: true }).click();
  };
  await archiveCurrent();
  await expect(modal).toHaveAttribute('aria-label', titles[2]);
  await expect(cards).toHaveCount(2);
  await expect(
    modal.getByRole('button', { name: 'Предыдущее объявление', exact: true }),
  ).toBeEnabled();
  await modal.getByRole('button', { name: 'Предыдущее объявление', exact: true }).click();
  await expect(modal).toHaveAttribute('aria-label', titles[0]);
  await modal.getByRole('button', { name: 'Следующее объявление', exact: true }).click();
  await archiveCurrent();
  await expect(modal).toHaveAttribute('aria-label', titles[0]);
  await archiveCurrent();
  await expect(modal).toHaveCount(0);
  await expect(cards).toHaveCount(0);
});

test('Personal rating filters and sort orders keep unrated listings distinct from new ones', async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  for (const [i, rating] of [null, 2, 5].entries()) {
    const l = await (
      await request.post('/api/listings', {
        data: { title: 'Фильтр оценки ' + i, address: 'Проверка личного фильтра', rent: 60000 },
      })
    ).json();
    ids.push(l.id);
    if (rating) await request.patch('/api/listings/' + l.id, { data: { rating } });
  }
  await page.goto('/');
  await page.getByLabel('Поиск по адресу или метро').fill('Проверка личного фильтра');
  const cards = page.locator('.apartment-card');
  await expect(cards).toHaveCount(3);
  const filter = page.getByRole('group', { name: 'Фильтр по моей оценке' });
  await filter.getByRole('button', { name: 'С оценкой', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Сортировка', exact: true }).click();
  await page.getByRole('option', { name: 'Оценка: по возрастанию', exact: true }).click();
  await expect(cards.first()).toHaveAttribute('data-listing-id', ids[1]);
  await filter.getByRole('button', { name: 'Все', exact: true }).click();
  await expect(cards.last()).toHaveAttribute('data-listing-id', ids[0]);
  await page.getByRole('combobox', { name: 'Сортировка', exact: true }).click();
  await page.getByRole('option', { name: 'Оценка: по убыванию', exact: true }).click();
  await expect(cards.first()).toHaveAttribute('data-listing-id', ids[2]);
  await expect(cards.last()).toHaveAttribute('data-listing-id', ids[0]);
  await filter.getByRole('button', { name: 'Без оценки', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: 'Подробнее и расчет', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Нравится', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(cards).toHaveCount(0);
  await filter.getByRole('button', { name: 'С оценкой', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Saved search criteria apply immediately on reopening search and reload without parsing', async ({
  page,
  request,
}) => {
  for (const rent of [45000, 95000])
    await request.post('/api/listings', {
      data: {
        title: 'Сохранённый поиск ' + rent,
        address: 'Москва, проверка восстановления',
        rent,
      },
    });
  await page.goto('/');
  await page.getByLabel('Аренда в месяц, ₽ до', { exact: true }).fill('50000');
  await page.getByLabel('Поиск по адресу или метро').fill('проверка восстановления');
  let searches = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/search(?:$|\/cian)/.test(req.url())) searches++;
  });
  await page.reload();
  await expect(page.getByLabel('Аренда в месяц, ₽ до', { exact: true })).toHaveValue('50000');
  await expect(page.locator('.apartment-card')).toHaveCount(1);
  await expect(page.locator('.apartment-card')).toContainText('45 000');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Избранное/ })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^Все квартиры/ })
    .click();
  await expect(page.locator('.apartment-card')).toHaveCount(1);
  expect(searches).toBe(0);
});

test('Sidebar scrolls to its bottom independently in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const sidebar = page.locator('#main-navigation');
  await expect(sidebar).toBeVisible();
  const pageTop = await page.evaluate(() => window.scrollY);
  await sidebar.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(sidebar.locator('.profile')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
  await sidebar.screenshot({ path: 'test-results/sidebar-scrolled.png' });
});
