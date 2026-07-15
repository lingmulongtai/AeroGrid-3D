import { expect, test, type Page } from '@playwright/test';

async function expectHealthyPage(page: Page) {
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.locator('vite-error-overlay, .vite-error-overlay')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('Demo stays separate and supports the primary exploration flow', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('dialog')).toContainText('See the world in motion.');
  await page.getByRole('button', { name: /Global Demo/ }).click();

  await expect(page.getByText('DEMO', { exact: true })).toBeVisible();
  await expect(page.getByText(/Deterministic simulation/)).toBeVisible();
  await page.getByRole('combobox').fill('JAL');
  const firstAircraft = page.getByRole('option').first();
  await expect(firstAircraft).toBeVisible();
  await firstAircraft.click();
  await expect(page.getByRole('button', { name: 'Track aircraft' })).toBeVisible();
  await page.getByRole('button', { name: 'Track aircraft' }).click();
  await expect(page.getByRole('button', { name: 'Stop tracking' })).toBeVisible();

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Layers' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '日本語' }).click();
  await expect(page.getByRole('button', { name: 'レイヤー', exact: true })).toBeVisible();

  await expectHealthyPage(page);
  expect(pageErrors).toEqual([]);
});

test('Live Beta failure is explicit and never replaced with demo aircraft', async ({ page }) => {
  const now = new Date().toISOString();
  await page.route('**/api/v1/flights?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      mode: 'live-beta', source: 'airplanes.live', status: 'unavailable',
      generatedAt: now, expiresAt: now,
      coverage: { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150 },
      items: [], message: 'provider unavailable',
    }),
  }));
  await page.route('**/api/v1/weather**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      mode: 'live-beta', source: 'rainviewer', status: 'unavailable',
      generatedAt: now, expiresAt: now, coverage: { kind: 'global' }, items: [],
    }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: /Live Beta/ }).click();

  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(/No simulated aircraft are shown/)).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toBeVisible();
  await expectHealthyPage(page);
});

test('all mobile controls remain reachable inside the viewport or bottom sheet', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only acceptance check');
  await page.goto('/');
  await page.getByRole('button', { name: /Global Demo/ }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();

  const panel = page.getByRole('complementary', { name: 'Layers' });
  await expect(panel).toBeVisible();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds).not.toBeNull();
  expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(390);
  await panel.locator('.space-preview').scrollIntoViewIfNeeded();
  await expect(panel.getByText('Space Preview')).toBeVisible();
  await expectHealthyPage(page);
});
