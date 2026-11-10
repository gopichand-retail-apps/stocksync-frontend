import { expect, test } from '@playwright/test';

const apiPort = Number(process.env.STOCKSYNC_E2E_API_PORT ?? 5404);
const expectedDataMode = process.env.VITE_IS_MOCK === 'false' ? 'live' : 'mock';

test('role discovery and login use the selected API', async ({ page }) => {
  const apiOrigins = new Set<string>();
  const apiResponses: Array<{ path: string; status: number }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/')) apiOrigins.add(url.origin);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) {
      apiResponses.push({ path: url.pathname, status: response.status() });
    }
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', expectedDataMode);
  await expect(page.getByRole('button', { name: 'Associate Central Market' })).toBeVisible();
  await page.getByRole('button', { name: 'Associate Central Market' }).click();
  await page.getByLabel('Password').fill('stock-demo-only');
  await page.getByRole('button', { name: 'Open workspace' }).click();

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(apiOrigins).toEqual(new Set([`http://127.0.0.1:${apiPort}`]));
  expect(apiResponses).toContainEqual({ path: '/api/v1/auth/synthetic-roles', status: 200 });
  expect(apiResponses).toContainEqual({ path: '/api/v1/auth/login', status: 200 });
});


test('an inventory manager receives stock through the selected API', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', expectedDataMode);
  await page.getByRole('button', { name: /All locations/ }).click();
  await page.getByLabel('Password').fill('stock-demo-only');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Receive stock' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Product')).toBeVisible();
  await dialog.locator('#operation-sku').selectOption('sku-coffee');
  await dialog.getByLabel('Quantity').fill('2');
  const receiptResponse = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === '/api/v1/receipts' && request.method() === 'POST';
  });
  await dialog.getByRole('button', { name: 'Receive stock' }).click();

  expect((await receiptResponse).status()).toBe(201);
  await expect(page.getByText('Stock receipt recorded. On-hand quantity is updated.')).toBeVisible();
  await expect(dialog).not.toBeVisible();
});
