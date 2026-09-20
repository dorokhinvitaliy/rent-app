import { test, expect, request as createRequest } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });
test('Guest searches the database before Cian and logs in only for personal actions', async ({
  page,
}) => {
  const admin = await createRequest.newContext({
    baseURL: 'http://127.0.0.1:3100',
    storageState: 'test-results/auth.json',
  });
  const listing = await (
    await admin.post('/api/listings', {
      data: {
        title: 'Гостевая проверка квартиры',
        address: 'Москва, гостевая улица',
        rent: 42000,
        area: 42,
      },
    })
  ).json();
  await admin.patch('/api/listings/' + listing.id, {
    data: { notes: 'Секретная заметка', rating: 4 },
  });
  let starts = 0;
  await page.route('**/api/search/cian', async (route) => {
    starts++;
    await route.fulfill({
      json: {
        id: 'guest-search',
        status: 'done',
        message: 'Новые объявления проверены',
        count: 0,
        warnings: [],
        listingIds: [],
        search: route.request().postDataJSON(),
      },
    });
  });
  await page.goto('/');
  const card = page.locator('.apartment-card').filter({ hasText: 'Гостевая проверка квартиры' });
  await expect(card).toBeVisible();
  await expect(page.getByText('Секретная заметка')).toHaveCount(0);
  await page.getByLabel('Аренда в месяц, ₽ до', { exact: true }).fill('43000');
  await page.getByRole('button', { name: 'Найти квартиры', exact: true }).click();
  await expect(card).toBeVisible();
  expect(starts).toBe(0);
  await page.getByRole('button', { name: 'Найти свежие объявления', exact: true }).click();
  expect(starts).toBe(1);
  await card.getByRole('button', { name: 'В избранное', exact: true }).click();
  const login = page.locator('.account-dialog');
  await expect(login).toBeVisible();
  await login.getByLabel('Email', { exact: true }).fill('e2e@example.test');
  await login.getByLabel('Пароль', { exact: true }).fill('e2e-password-long');
  await login.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(login).toHaveCount(0);
  await expect(page.locator('.account-button')).toContainText('e2e');
  await card.getByRole('button', { name: 'В избранное', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Убрать из избранного' })).toBeVisible();
  await page.locator('.account-button').click();
  await expect(page.locator('.account-button')).toContainText('Войти');
  await expect(page.getByText('Секретная заметка')).toHaveCount(0);
  await admin.delete('/api/listings/' + listing.id, { data: {} });
  await admin.dispose();
});
