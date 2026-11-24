/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test';

const apiPort = Number(process.env.STOCKSYNC_E2E_API_PORT ?? 5404);
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const locationId = 'loc-central';
const skuId = 'sku-coffee';
const quantity = 12;

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /All locations/ }).click();
  await page.getByLabel('Password').fill('stock-demo-only');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  const trigger = page.getByRole('button', { name: 'Receive stock', exact: true });
  await expect(trigger).toBeVisible();
  return trigger;
}

async function stockAndReceipts(page: Page) {
  const inventory = await page.request.get(`${apiUrl}/inventory?locationId=${locationId}`);
  const ledger = await page.request.get(`${apiUrl}/ledger?locationId=${locationId}`);
  expect(inventory.ok()).toBe(true);
  expect(ledger.ok()).toBe(true);
  const items: { skuId: string; onHand: number }[] = await inventory.json();
  const entries: { id: string; skuId: string; movementType: string; quantityDelta: number }[] = await ledger.json();
  const item = items.find((entry) => entry.skuId === skuId);
  if (!item) throw new Error('Receipt test inventory item is missing');
  return {
    onHand: item.onHand,
    receipts: entries.filter((entry) => entry.skuId === skuId && entry.movementType === 'receipt'),
  };
}

test('a lost receipt response and retry create exactly one stock movement', async ({ page }) => {
  const trigger = await signIn(page);
  const before = await stockAndReceipts(page);
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product').selectOption(skuId);
  await dialog.getByLabel('Quantity').fill(String(quantity));
  await dialog.getByLabel('Reference note (optional)').fill('Synthetic receiving dock');

  let firstReply: unknown;
  let firstHeaders: Record<string, string> = {};
  await page.route(
    `${apiUrl}/receipts`,
    async (route) => {
      firstHeaders = route.request().headers();
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      firstReply = await committed.json();
      await committed.dispose();
      await route.abort('failed');
    },
    { times: 1 },
  );

  await dialog.getByRole('button', { name: 'Receive stock', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Awaiting confirmation');
  await expect(dialog.getByLabel('Quantity')).toHaveValue(String(quantity));
  await expect(dialog.getByLabel('Reference note (optional)')).toHaveValue('Synthetic receiving dock');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  const afterLostReply = await stockAndReceipts(page);
  expect(afterLostReply.receipts).toHaveLength(before.receipts.length + 1);
  expect(afterLostReply.onHand).toBe(before.onHand + quantity);

  const arrival = page.waitForResponse(`${apiUrl}/receipts`);
  await dialog.getByRole('button', { name: 'Retry receipt' }).click();
  const replay = await arrival;
  expect(replay.status()).toBe(201);
  const result: { id: string } = await replay.json();
  expect(result).toEqual(firstReply);
  const retryHeaders = replay.request().headers();
  expect(retryHeaders['idempotency-key']).toBeTruthy();
  expect(retryHeaders['idempotency-key']).toBe(firstHeaders['idempotency-key']);
  expect(retryHeaders['x-request-id']).not.toBe(firstHeaders['x-request-id']);
  const afterRetry = await stockAndReceipts(page);
  expect.soft(afterRetry.receipts, 'receipt movements after retry').toHaveLength(before.receipts.length + 1);
  expect.soft(afterRetry.onHand, 'on-hand units after retry').toBe(before.onHand + quantity);
  await expect(page.getByRole('status').filter({ hasText: 'Recorded: 12 units at Central Market.' })).toBeVisible();
  await page.getByRole('link', { name: 'View stock movement' }).click();
  await expect(page.locator(`#movement-${result.id}`)).toBeFocused();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await trigger.click();
  await dialog.getByLabel('Product').selectOption(skuId);
  await dialog.getByLabel('Quantity').fill(String(quantity));
  await dialog.getByLabel('Reference note (optional)').fill('Synthetic receiving dock');
  const nextArrival = page.waitForResponse(`${apiUrl}/receipts`);
  await dialog.getByRole('button', { name: 'Receive stock', exact: true }).click();
  const next = await nextArrival;
  expect(next.status()).toBe(201);
  expect(next.request().headers()['idempotency-key']).not.toBe(firstHeaders['idempotency-key']);
  const afterNext = await stockAndReceipts(page);
  expect(afterNext.receipts).toHaveLength(before.receipts.length + 2);
  expect(afterNext.onHand).toBe(before.onHand + 2 * quantity);
});

async function tabTo(page: Page, control: Locator, limit = 30) {
  for (let step = 0; step < limit; step++) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(control).toBeFocused();
}

async function expectContained(page: Page, dialog: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test('receipt recovery and keyboard path at 320, 390, 768 and 1280px fresh and resized', async ({ page }, testInfo) => {
  const trigger = await signIn(page);
  const unexpectedOrigins = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') unexpectedOrigins.add(url.origin);
  });

  for (const width of [320, 390, 768, 1280]) {
    await test.step(`${width} CSS px`, async () => {
      const viewport = { width, height: 820 };
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(trigger).toBeVisible();
      await tabTo(page, trigger);
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeFocused();
      const quantityInput = dialog.getByLabel('Quantity');
      await tabTo(page, quantityInput);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('3');
      await expect(quantityInput).toHaveValue('3');

      await page.route(`${apiUrl}/receipts`, (route) => route.abort('failed'), { times: 1 });
      const receive = dialog.getByRole('button', { name: 'Receive stock', exact: true });
      await tabTo(page, receive);
      await expect(receive).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('status')).toContainText('Awaiting confirmation');
      const retry = dialog.getByRole('button', { name: 'Retry receipt' });
      await expect(retry).toBeFocused();
      await expect(retry).toBeInViewport();
      expect(await retry.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      await expectContained(page, dialog);
      await page.screenshot({ path: testInfo.outputPath(`receipt-awaiting-${width}px.png`) });

      await page.setViewportSize({ width: width === 1280 ? 320 : 1280, height: viewport.height });
      await page.setViewportSize(viewport);
      await expectContained(page, dialog);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Recorded: 3 units at Central Market.')).toBeVisible();
      await expect(trigger).toBeFocused();
    });
  }
  expect(unexpectedOrigins.size).toBe(0);
});
