import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
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
  await page.route('**/api/search/cian', async (route) => {
    submitted = route.request().postDataJSON();
    job = {
      id: 'search-e2e',
      url: 'https://www.cian.ru/cat.php?deal_type=rent&type=4',
      status: 'waiting',
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
  await expect(minPrice.locator('xpath=../..')).toHaveCSS('border-color', 'rgb(69, 97, 232)');
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
  await expect(page.locator('.apartment-card')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Поиск выполняется' })).toBeDisabled();
  await page.getByRole('button', { name: 'Показать всю сохраненную подборку' }).click();
  await expect(page.locator('.apartment-card')).toHaveCount(8);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/search-mobile.png' });
});
