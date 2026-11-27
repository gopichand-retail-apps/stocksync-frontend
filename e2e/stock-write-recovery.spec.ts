/// <reference lib="dom" />
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const apiUrl = `http://127.0.0.1:${Number(process.env.STOCKSYNC_E2E_API_PORT ?? 5404)}/api/v1`;
const locationId = 'loc-central';
const skuId = 'sku-coffee';
const receiptUrl = `${apiUrl}/receipts`;
const adjustmentUrl = `${apiUrl}/adjustments`;

let managerCookies: Awaited<ReturnType<BrowserContext['cookies']>>;

test.beforeAll(async ({ browser, baseURL }) => {
  // One genuine login keeps the scenario suite within the API's login rate limit.
  const context = await browser.newContext({ baseURL });
  try {
    await signIn(await context.newPage());
    managerCookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(managerCookies);
});

async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${apiUrl}/${path}`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /All locations/ }).click();
  await page.getByLabel('Password').fill('stock-demo-only');
  const login = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Open workspace' }).click();
  expect((await login).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Stock overview' })).toBeVisible();
}

async function balance(page: Page) {
  const items = await read<Array<{ skuId: string; onHand: number; reserved: number; version: number }>>(
    page,
    `inventory?locationId=${locationId}`,
  );
  const item = items.find((row) => row.skuId === skuId);
  if (!item) throw new Error('Expected a seeded stock balance');
  return item;
}

function movements(page: Page) {
  return read<Array<{ id: string; referenceId: string; quantityDelta: number; movementType: string }>>(
    page,
    `ledger?locationId=${locationId}`,
  );
}

async function openInventoryOperation(page: Page, name: string) {
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'BEV-1042' }).getByRole('button', { name }).click();
  return page.getByRole('dialog');
}

async function openReceipt(page: Page, note: string) {
  await page.getByRole('button', { name: 'Receive stock', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product').selectOption(skuId);
  await dialog.getByLabel('Quantity').fill('12');
  await dialog.getByLabel('Reference note (optional)').fill(note);
  return dialog;
}

async function loseCommittedReply(page: Page, url: string) {
  const committed: {
    body?: { id: string };
    key?: string;
    requestId?: string;
  } = {};
  await page.route(url, async (route) => {
    if (route.request().method() !== 'POST' || committed.key) {
      await route.fallback();
      return;
    }
    committed.key = route.request().headers()['idempotency-key'];
    committed.requestId = route.request().headers()['x-request-id'];
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committed.body = await response.json();
    await response.dispose();
    await route.abort('failed');
  });
  return committed;
}

async function submitReceipt(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Receive stock', exact: true }).click();
}

test('a delayed adjustment cannot discard a newer unconfirmed receipt', async ({ page }) => {
  // Deliver the original server reply even if the browser tries to cancel its wait.
  await page.addInitScript(() => {
    const fetch = window.fetch;
    const release = new Promise<void>((resolve) => {
      window.addEventListener('release-test-adjustment', () => resolve(), { once: true });
    });
    window.fetch = async (input, init) => {
      const delayedAdjustment = typeof input === 'string' && input.endsWith('/adjustments');
      if (!delayedAdjustment) return fetch(input, init);
      const response = await fetch(input, { ...init, signal: undefined });
      await release;
      document.documentElement.dataset.testAdjustmentDelivered = 'true';
      return response;
    };
  });
  await page.goto('/');
  const before = await balance(page);
  const adjust = await openInventoryOperation(page, 'Adjust House Blend Coffee at Central Market');
  await adjust.getByLabel('Adjustment delta').fill('-2');
  await adjust.getByLabel('Reference note').fill('Delayed adjustment');
  const adjustmentReply = page.waitForResponse(
    (response) => response.url() === adjustmentUrl && response.request().method() === 'POST',
  );
  await adjust.getByRole('button', { name: 'Adjust stock' }).click();
  expect((await adjustmentReply).status()).toBe(201);
  await adjust.getByRole('button', { name: 'Cancel', exact: true }).click();
  const receipt = await openReceipt(page, 'Unconfirmed dock delivery');
  const committed = await loseCommittedReply(page, receiptUrl);
  await submitReceipt(receipt);
  await expect(receipt.getByText('Awaiting confirmation')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('release-test-adjustment'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-test-adjustment-delivered', 'true');
  await expect(receipt.getByText('Awaiting confirmation')).toBeVisible();
  await expect(receipt.getByLabel('Quantity')).toHaveValue('12');
  await expect(receipt.getByLabel('Reference note (optional)')).toHaveValue('Unconfirmed dock delivery');

  const arrival = page.waitForResponse(receiptUrl);
  await receipt.getByRole('button', { name: 'Retry receipt' }).click();
  const replay = await arrival;
  expect(await replay.json()).toEqual(committed.body);
  expect(replay.request().headers()['idempotency-key']).toBe(committed.key);
  expect((await balance(page)).onHand).toBe(before.onHand - 2 + 12);
  expect((await movements(page)).filter((row) => row.referenceId === committed.key)).toHaveLength(1);
});

test('adjustment, reservation, and transfer drafts replay a lost committed write once', async ({ page }) => {
  await page.goto('/');
  const cases = [
    { path: 'adjustments', label: 'Adjust stock', onHand: -2, reserved: 0, movement: 'manual_adjustment' },
    { path: 'reservations', label: 'Reserve stock', onHand: 0, reserved: 2 },
    { path: 'transfers', label: 'Create transfer', onHand: -2, reserved: 0, movement: 'transfer_out' },
  ];
  for (const operation of cases) {
    await test.step(operation.path, async () => {
      const dialog = await openWrite(page, operation.path);
      const before = await balance(page);
      const url = `${apiUrl}/${operation.path}`;
      const committed = await loseCommittedReply(page, url);
      await dialog.getByRole('button', { name: operation.label, exact: true }).click();
      await expect(dialog.getByText('Awaiting confirmation')).toBeVisible();
      const arrival = page.waitForResponse(
        (response) => response.url() === url && response.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Retry operation' }).click();
      const retry = await arrival;
      expect(retry.status()).toBe(201);
      expect(await retry.json()).toEqual(committed.body);
      expect(retry.request().headers()['idempotency-key']).toBe(committed.key);
      expect(retry.request().headers()['x-request-id']).not.toBe(committed.requestId);
      await expect(dialog).not.toBeVisible();
      const after = await balance(page);
      expect(after.onHand).toBe(before.onHand + operation.onHand);
      expect(after.reserved).toBe(before.reserved + operation.reserved);
      await expectSingleEffect(page, operation, committed);
    });
  }
});

async function openWrite(page: Page, path: string) {
  if (path === 'adjustments') {
    const dialog = await openInventoryOperation(page, 'Adjust House Blend Coffee at Central Market');
    await dialog.getByLabel('Adjustment delta').fill('-2');
    await dialog.getByLabel('Reference note').fill('Adjustment retry check');
    return dialog;
  }
  if (path === 'reservations') {
    const dialog = await openInventoryOperation(page, 'Reserve House Blend Coffee at Central Market');
    await dialog.getByLabel('Quantity').fill('2');
    await dialog.getByLabel('Reference note (optional)').fill('Reservation retry check');
    return dialog;
  }
  await page.getByRole('button', { name: /^Transfers/ }).click();
  await page.getByRole('button', { name: 'New transfer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product').selectOption(skuId);
  await dialog.getByLabel('Quantity').fill('2');
  return dialog;
}

async function expectSingleEffect(
  page: Page,
  operation: { path: string; movement?: string },
  committed: { key?: string; body?: { id: string } },
) {
  if (operation.path !== 'adjustments') {
    const rows = await read<Array<{ id: string; note: string | null }>>(page, operation.path);
    expect(rows.filter((row) => row.id === committed.body?.id)).toHaveLength(1);
    if (operation.path === 'reservations') {
      expect(rows.filter((row) => row.note === 'Reservation retry check')).toHaveLength(1);
    }
  }
  if (operation.movement) {
    const reference = operation.path === 'transfers' ? committed.body?.id : committed.key;
    expect((await movements(page)).filter((row) => row.referenceId === reference)).toEqual([
      expect.objectContaining({ movementType: operation.movement, quantityDelta: -2 }),
    ]);
  }
}

async function postAdjustment(page: Page, delta: number) {
  const session = await read<{ csrfToken: string }>(page, 'auth/session');
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(adjustmentUrl, {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': crypto.randomUUID() },
    data: { locationId, skuId, delta, note: 'Synthetic stock change' },
  });
  expect(response.status()).toBe(201);
}

test('an old receipt can be reopened by ID even when the first lookup fails', async ({ page }) => {
  await page.goto('/');
  const dialog = await openReceipt(page, 'Receipt kept for later review');
  const arrival = page.waitForResponse(receiptUrl);
  await submitReceipt(dialog);
  const result: { id: string } = await (await arrival).json();
  await expect(dialog).not.toBeVisible();
  for (let i = 0; i < 41; i++) await postAdjustment(page, 1);
  expect((await movements(page)).some((entry) => entry.id === result.id)).toBe(false);
  await page.route(`${apiUrl}/ledger/${result.id}`, (route) => route.abort('failed'), { times: 1 });
  await page.getByRole('link', { name: 'View stock movement' }).click();
  await expect(page.getByRole('alert')).toContainText('This stock movement could not be loaded.');
  await page.getByRole('button', { name: 'Retry lookup' }).click();
  const movement = page.locator(`#movement-${result.id}`);
  await expect(movement).toBeFocused();
  await expect(movement).toContainText('Receipt kept for later review');
});

test('a fresh count uses the updated balance and an intervening write requires a recount', async ({ page }) => {
  await page.goto('/');
  const receipt = await openReceipt(page, 'Count refresh check');
  await submitReceipt(receipt);
  await expect(receipt).not.toBeVisible();
  const initial = await balance(page);
  const count = await openInventoryOperation(page, 'Count House Blend Coffee at Central Market');
  const input = count.getByLabel('Physical count');
  await expect(input).toHaveValue(String(initial.onHand));
  await input.fill(String(initial.onHand - 1));
  await postAdjustment(page, 1);
  const submit = count.getByRole('button', { name: 'Reconcile cycle count' });
  await submit.click();
  await expect(count.getByRole('alert')).toContainText('Stock changed.');
  await expect(input).toHaveValue('');
  const latest = await balance(page);
  await expect(count.getByText(new RegExp(`/ ${latest.onHand} on hand`))).toBeVisible();
  await input.fill(String(latest.onHand));
  await submit.click();
  await expect(count).not.toBeVisible();
  expect((await balance(page)).onHand).toBe(latest.onHand);
});
