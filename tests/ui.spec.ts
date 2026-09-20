import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
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
  await page
    .getByPlaceholder('Что понравилось? Что уточнить у владельца?')
    .fill('Уточнить счетчики');
  await page.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить заметку' })).toBeDisabled();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByLabel('Поиск по адресу или метро').fill('');
  await page.getByLabel('Сравнить Светлая квартира у парка').check();
  await page.getByLabel('Сравнить Тихое место в центре').check();
  await page.getByRole('button', { name: 'Сравнить расходы' }).click();
  await expect(page.locator('.comparison')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт сравнения' }).click();
  expect((await downloaded).suggestedFilename()).toBe('mesto-apartments.xlsx');
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
  await expect(page.locator('.calculator')).toBeVisible();
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
  await expect(minPrice.locator('xpath=../..')).toHaveCSS('border-color', 'rgb(23, 25, 29)');
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
  await panel.getByRole('button', { name: 'Еще параметры' }).click();
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
  expect(submitted).toMatchObject({
    region: '2',
    rooms: [2],
    maxRent: 90000,
    minArea: 40,
    maxArea: 70,
    metroMinutes: 10,
    noCommission: true,
  });
  await expect(
    panel.getByText('Пройдите проверку в открывшемся браузере', { exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Открыть окно проверки' }).click();
  await expect.poll(() => opened).toBe(true);
  await expect(page.locator('.apartment-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Показать только результаты запуска' }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Поиск выполняется' })).toBeDisabled();
  await page.getByRole('button', { name: 'Показать всю сохраненную подборку' }).click();
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
  await page.getByRole('checkbox', { name: 'Аэропорт', exact: true }).check();
  await query.fill('Сокол');
  await page.getByRole('checkbox', { name: 'Сокол', exact: true }).check();
  await page.getByRole('button', { name: 'Убрать станцию Аэропорт', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Убрать станцию Сокол', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/metro-picker.png' });
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Найти квартиры', exact: true }).click();
  await expect.poll(() => submitted?.metroStations).toEqual([116]);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Убрать станцию Сокол', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Город', exact: true }).click();
  await page.getByRole('option', { name: 'Санкт-Петербург', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать станцию Сокол', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Желаемые станции метро' }).click();
  await page.getByRole('searchbox', { name: 'Найти станцию метро' }).fill('Автово');
  await page.getByRole('checkbox', { name: 'Автово', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.metro-picker').screenshot({ path: 'test-results/metro-picker-mobile.png' });
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
  await card.getByRole('button', { name: '5 из 5 — Отличный вариант', exact: true }).click();
  await expect(
    card.getByRole('button', { name: '5 из 5 — Отличный вариант', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await card.locator('.card-title').hover();
  await expect(card.locator('.rating-popover')).toBeHidden();
  await card.locator('.rating-summary').hover();
  await expect(
    card.getByRole('button', { name: '5 из 5 — Отличный вариант', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Сортировка', exact: true }).click();
  await page.getByRole('option', { name: 'По моей оценке', exact: true }).click();
  await expect(page.locator('.apartment-card').first().locator('.rating-summary')).toHaveAttribute(
    'title',
    '5/5 · Отличный вариант',
  );
  let refreshed = false;
  await page.route('**/api/listings/' + sourced.id + '/refresh', (route) => {
    refreshed = true;
    return route.fulfill({
      json: { id: 'refresh-test', url: sourced.url, status: 'running', count: 0, warnings: [] },
    });
  });
  await card.getByRole('button', { name: 'Актуализировать ' + sourced.title, exact: true }).click();
  await expect.poll(() => refreshed).toBe(true);
  await card.screenshot({ path: 'test-results/rating-card.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await card.getByRole('button', { name: 'Оценить ' + sourced.title, exact: true }).click();
  await card.screenshot({ path: 'test-results/rating-thermometer-mobile.png' });
  await card.getByRole('button', { name: 'Сбросить оценку', exact: true }).click();
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
  await card.getByRole('button', { name: '1 из 5 — Не подходит', exact: true }).click();
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
  await card.getByRole('button', { name: '4 из 5 — Нравится', exact: true }).click();
  await expect(card.getByRole('button', { name: '4 из 5 — Нравится', exact: true })).toBeDisabled();
  await expect(neighbor.getByRole('checkbox')).toBeEnabled();
  await expect(neighbor.locator('.rating-clear')).toBeDisabled();
  expect(await neighbor.locator('.rating-thermometer button:disabled').count()).toBe(0);
  release();
  await expect(card.locator('.rating-summary')).toHaveAttribute('title', '4/5 · Нравится');
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
  await reserve.getByRole('button', { name: '5 из 5 — Отличный вариант', exact: true }).click();
  await expect(cards.locator('.card-title')).toHaveText([
    'Рейтинг тест Доступный',
    'Рейтинг тест Запасной',
    'Рейтинг тест Лидер',
  ]);
  await reserve.locator('.rating-summary').hover();
  await reserve.getByRole('button', { name: '1 из 5 — Не подходит', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/ranking-mobile.png', fullPage: true });
});
