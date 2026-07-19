import { expect, test } from '@playwright/test';
import { readProductionAccounts } from './production-credentials';

test.skip(!process.env.PRODUCTION_SMOKE_URL, 'Runs only after a production deployment.');

test('renders the deployed Auth boundary and static assets', async ({ page }) => {
  const response = await page.goto('./#/dashboard');
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Sign in to Promotion Manager' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sentient' }).first()).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('authenticates a controlled production account and reads protected data', async ({ page }) => {
  const { sales } = readProductionAccounts();

  await page.goto('./#/dashboard');
  await page.getByLabel('Email').fill(sales.email);
  await page.getByLabel('Password').fill(sales.password);
  await page.getByRole('button', { name: /^Sign in/ }).click();

  await expect(page.getByRole('heading', { name: /^Good morning,/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();

  const clientsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/clients') && response.request().method() === 'GET',
  );
  await page.getByRole('link', { name: 'Clients' }).click();
  expect((await clientsResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await expect(page.getByLabel('Loading clients')).toHaveCount(0);
  await expect(page.getByText(/Unable to|failed/i)).toHaveCount(0);
});
