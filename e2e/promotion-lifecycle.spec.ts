import { expect, test } from '@playwright/test';

test.skip(
  Boolean(process.env.E2E_REAL_BACKEND),
  'The interactive preview suite is replaced by the local Supabase suite in CI.',
);

test('completes the internal promotion lifecycle with a revision cycle', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('./#/dashboard');
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible();

  await page.getByRole('link', { name: 'New promotion' }).click();
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Arcadia Hotels' });
  await page.getByLabel('Promotion name').fill('E2E verified launch');
  await page
    .getByLabel('Description')
    .fill('A complete workflow test from sales intake through invoicing.');
  await page.getByLabel('Due date').fill('2026-08-15');
  await page.getByRole('button', { name: 'Create promotion' }).click();
  await expect(page.getByRole('heading', { name: 'E2E verified launch' })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Assign creator' }).first().click();
  await page
    .getByRole('combobox', { name: 'Creator', exact: true })
    .selectOption({ label: 'Leo Martins' });
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByText('Creator assigned', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start creative' }).first().click();
  await expect(page.getByText('Creative in progress', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Resources/ }).click();
  await page.getByRole('button', { name: 'Attach resource' }).first().click();
  await page.getByLabel('Display name').fill('E2E creative v1');
  await page.getByLabel('HTTPS link').fill('https://www.canva.com/design/e2e-v1');
  await page.getByRole('button', { name: 'Attach resource' }).last().click();
  await expect(page.getByRole('heading', { name: 'E2E creative v1' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark ready for approval' }).first().click();
  await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Approval/ }).click();
  await page.getByRole('button', { name: 'Request revision' }).first().click();
  await page
    .getByLabel('Revision notes')
    .fill('Increase contrast and move the product mark into the opening frame.');
  await page.getByRole('button', { name: 'Request revision' }).last().click();
  await expect(page.getByText('Revision requested', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start creative' }).first().click();
  await page.getByRole('tab', { name: /Resources/ }).click();
  await page.getByRole('button', { name: 'Attach resource' }).first().click();
  await page.getByLabel('Display name').fill('E2E creative v2');
  await page.getByLabel('HTTPS link').fill('https://www.canva.com/design/e2e-v2');
  await page.getByRole('button', { name: 'Attach resource' }).last().click();
  await page.getByRole('button', { name: 'Mark ready for approval' }).first().click();
  await page.getByRole('tab', { name: /Approval/ }).click();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await page.getByRole('button', { name: 'Approve submission' }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start publishing' }).click();
  await page.getByRole('button', { name: 'Record publication' }).first().click();
  await page.getByLabel('Destination').fill('@e2e_client');
  await page.getByLabel('Publication URL').fill('https://www.instagram.com/p/e2e-verified');
  await page.getByRole('button', { name: 'Record publication' }).last().click();
  await expect(page.getByText('Ready for invoicing', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Register invoice' }).first().click();
  await page.getByLabel('Amount').fill('4200');
  await page.getByLabel('Invoice number').fill('E2E-2026-001');
  await page.getByRole('button', { name: 'Register invoice' }).last().click();
  await expect(page.getByText('Invoiced', { exact: true })).toBeVisible();
});

test('keeps a promotion detail route usable through a static-site refresh', async ({ page }) => {
  await page.goto('./#/promotions/20000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: 'Summer rooftop launch' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Summer rooftop launch' })).toBeVisible();
});
