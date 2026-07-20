import { expect, test, type Browser, type Page } from '@playwright/test';
import { readProductionAccounts, type ProductionCredential } from './production-credentials';

const production = Boolean(process.env.E2E_PRODUCTION);
const realBackend = Boolean(process.env.E2E_REAL_BACKEND || production);
const localCredential = (email: string, displayName: string): ProductionCredential => ({
  displayName,
  email,
  password: 'SentientLocal!2026',
});
const localAccounts = {
  admin: localCredential('esteban@sentientagency.io', 'Esteban'),
  sales: localCredential('sergio@sentientagency.io', 'Sergio'),
  creator: localCredential('santiagoflhi@gmail.com', 'Santiago'),
};

test.skip(!realBackend, 'Requires a freshly reset local Supabase stack.');

async function authenticatedPage(
  browser: Browser,
  baseURL: string,
  credential: ProductionCredential,
) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('./#/dashboard');
  await page.getByLabel('Email').fill(credential.email);
  await page.getByLabel('Password').fill(credential.password);
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  return { context, page };
}

async function selectAssignee(page: Page, label: string, assignee: ProductionCredential) {
  const select = page.getByRole('combobox', { name: label, exact: true });
  const optionLabel = assignee.displayName;
  if (!optionLabel) throw new Error(`No display name was configured for ${assignee.email}.`);
  await expect(select.locator('option').filter({ hasText: assignee.email })).toHaveCount(0);
  const option = select.locator('option').filter({ hasText: optionLabel });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`No selectable profile value was found for ${optionLabel}.`);
  await select.selectOption(value);
}

async function openPromotion(page: Page, promotionHash: string, title: string) {
  await page.goto(`./${promotionHash}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

async function processOutbox(page: Page) {
  await page.goto('./#/administration');
  await page.getByRole('tab', { name: 'Operations' }).click();
  await page.getByRole('button', { name: 'Process pending batch' }).click();
  await page.getByRole('button', { name: 'Process batch' }).click();
  await expect(page.getByText(/Worker completed\. \d+ events? processed\./).last()).toBeVisible({
    timeout: 15000,
  });
}

async function waitForResourceValidation(
  adminPage: Page,
  creatorPage: Page,
  promotionHash: string,
  title: string,
  resourceName: string,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await processOutbox(adminPage);
    await adminPage.waitForTimeout(500);
    await creatorPage.reload();
    await openPromotion(creatorPage, promotionHash, title);
    await creatorPage.getByRole('tab', { name: /Resources/ }).click();
    const resource = creatorPage
      .getByRole('heading', { name: resourceName })
      .locator('xpath=ancestor::article');
    if (
      (await resource.getByText('VALID', { exact: true }).isVisible()) ||
      (await resource.getByText('UNAVAILABLE', { exact: true }).isVisible())
    ) {
      return;
    }
    await creatorPage.waitForTimeout(500);
  }
  throw new Error(`Resource validation did not complete for ${resourceName}.`);
}

test('enforces role ownership across a complete database-backed lifecycle', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(production ? 300_000 : 120_000);
  if (!baseURL) throw new Error('Playwright baseURL is required.');
  const accounts = production ? readProductionAccounts() : localAccounts;

  const suffix = `${production ? 'production-' : 'local-'}${Date.now()}-${test.info().retry}`;
  const clientName = `${production ? '[PRODUCTION E2E] ' : ''}E2E Client ${suffix}`;
  const title = `${production ? '[PRODUCTION E2E] ' : ''}E2E verified launch ${suffix}`;
  const sessions = [];

  const admin = await authenticatedPage(browser, baseURL, accounts.admin);
  sessions.push(admin.context);

  const sales = await authenticatedPage(browser, baseURL, accounts.sales);
  sessions.push(sales.context);
  await sales.page.getByRole('link', { name: 'New promotion' }).click();
  await sales.page.getByRole('button', { name: 'Add client' }).click();
  await sales.page.getByLabel('Client name').fill(clientName);
  await sales.page.getByLabel('Billing email').fill(`billing-${suffix}@example.com`);
  await sales.page.getByRole('button', { name: 'Add client', exact: true }).last().click();
  await expect(sales.page.getByText(`${clientName} was added.`)).toBeVisible();
  await sales.page.getByLabel('Promotion name').fill(title);
  await sales.page
    .getByLabel('Description')
    .fill('A database-backed workflow test from sales intake through invoicing.');
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await sales.page.getByLabel('Due date').fill(dueDate);
  await sales.page.getByRole('button', { name: 'Continue' }).click();
  await expect(sales.page.getByRole('checkbox', { name: 'Instagram' })).toBeVisible();
  await sales.page.getByRole('button', { name: 'Create promotion' }).click();
  await expect(sales.page.getByRole('heading', { name: title })).toBeVisible();
  const promotionHash = new URL(sales.page.url()).hash;

  await sales.page.getByRole('button', { name: 'Assign creator' }).first().click();
  await selectAssignee(sales.page, 'Creator', accounts.creator);
  await sales.page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sales.page.getByText('Creator assigned', { exact: true })).toBeVisible();

  const creator = await authenticatedPage(browser, baseURL, accounts.creator);
  sessions.push(creator.context);
  await openPromotion(creator.page, promotionHash, title);
  await creator.page.getByRole('button', { name: 'Start creative' }).first().click();
  await expect(creator.page.getByText('Creative in progress', { exact: true })).toBeVisible();
  await creator.page.getByRole('tab', { name: /Resources/ }).click();
  await creator.page.getByRole('button', { name: 'Attach resource' }).first().click();
  await creator.page.getByLabel('Provider').selectOption('OTHER');
  await creator.page.getByLabel('Display name').fill('E2E creative v1');
  await creator.page.getByLabel('HTTPS link').fill('https://example.com/e2e-real-v1');
  await creator.page.getByRole('button', { name: 'Attach resource' }).last().click();
  await expect(creator.page.getByRole('heading', { name: 'E2E creative v1' })).toBeVisible();
  await waitForResourceValidation(
    admin.page,
    creator.page,
    promotionHash,
    title,
    'E2E creative v1',
  );
  await creator.page.getByRole('button', { name: 'Mark ready for approval' }).first().click();
  await expect(creator.page.getByText('Awaiting approval', { exact: true })).toBeVisible();

  await creator.page.getByRole('tab', { name: /Approval/ }).click();
  await creator.page.getByRole('button', { name: 'Request revision' }).first().click();
  await creator.page
    .getByLabel('Revision notes')
    .fill('Increase contrast and move the product mark into the opening frame.');
  await creator.page.getByRole('button', { name: 'Request revision' }).last().click();
  await expect(creator.page.getByText('Revision requested', { exact: true })).toBeVisible();

  await openPromotion(creator.page, promotionHash, title);
  await creator.page.getByRole('button', { name: 'Start creative' }).first().click();
  await creator.page.getByRole('tab', { name: /Resources/ }).click();
  await creator.page.getByRole('button', { name: 'Attach resource' }).first().click();
  await creator.page.getByLabel('Provider').selectOption('OTHER');
  await creator.page.getByLabel('Display name').fill('E2E creative v2');
  await creator.page.getByLabel('HTTPS link').fill('https://example.com/e2e-real-v2');
  await creator.page.getByRole('button', { name: 'Attach resource' }).last().click();
  await waitForResourceValidation(
    admin.page,
    creator.page,
    promotionHash,
    title,
    'E2E creative v2',
  );
  await creator.page.getByRole('button', { name: 'Mark ready for approval' }).first().click();

  await creator.page.getByRole('tab', { name: /Approval/ }).click();
  await creator.page.getByRole('button', { name: 'Approve' }).first().click();
  await creator.page.getByRole('button', { name: 'Approve submission' }).click();
  await expect(creator.page.getByText('Approved', { exact: true })).toBeVisible();

  await creator.page.getByRole('button', { name: 'Start publishing' }).click();
  await creator.page.getByRole('button', { name: 'Record publication' }).first().click();
  await creator.page.getByLabel('Destination').fill('@e2e_client');
  await creator.page
    .getByLabel('Publication URL')
    .fill(`https://www.instagram.com/p/e2e-${suffix}`);
  await creator.page.getByRole('button', { name: 'Record publication' }).last().click();

  await openPromotion(sales.page, promotionHash, title);
  await expect(sales.page.getByText('Ready for invoicing', { exact: true })).toBeVisible();
  await sales.page.getByRole('button', { name: 'Register invoice' }).first().click();
  await sales.page.getByLabel('Amount').fill('4200');
  await sales.page.getByLabel('Invoice number').fill(`E2E-${suffix}`);
  await sales.page.getByRole('button', { name: 'Register invoice' }).last().click();
  await expect(sales.page.getByText('Invoiced', { exact: true })).toBeVisible();

  await Promise.all(sessions.map((context) => context.close()));
});
