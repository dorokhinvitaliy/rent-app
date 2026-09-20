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
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
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
  expect(errors).toEqual([]);
});
