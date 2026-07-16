import { expect, test, type Page } from '@playwright/test';

async function expectHealthyPage(page: Page) {
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.locator('vite-error-overlay, .vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Track aircraft' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('button', { name: 'Stop tracking' })).toBeVisible();

  await expectHealthyPage(page);
  expect(pageErrors).toEqual([]);
});

test('settings remain responsive and switch the interface language', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: /Global Demo/}).click();
  await page.getByRole('button', {name: 'Layers', exact: true})
    .evaluate((button: HTMLButtonElement) => button.click());
  const panel = page.getByRole('complementary', {name: 'Layers'});
  await expect(panel).toBeVisible({timeout: 15_000});
  await panel.getByRole('button', {name: '日本語'})
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('button', {name: 'レイヤー', exact: true})).toBeVisible();
  await expectHealthyPage(page);
});

test('zoom changes camera height without a projection jump', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Global Demo/ }).click();

  const map = page.locator('.map-surface');
  const initial = await map.evaluate((element) => ({
    longitude: Number(element.getAttribute('data-longitude')),
    latitude: Number(element.getAttribute('data-latitude')),
    height: Number(element.getAttribute('data-camera-height')),
  }));
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });

  await expect(zoomIn).toBeVisible();
  await zoomIn.evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(async () => Number(await map.getAttribute('data-camera-height'))).toBeLessThan(initial.height);

  const nextLongitude = Number(await map.getAttribute('data-longitude'));
  const nextLatitude = Number(await map.getAttribute('data-latitude'));
  expect(Math.abs(nextLongitude - initial.longitude)).toBeLessThan(0.5);
  expect(Math.abs(nextLatitude - initial.latitude)).toBeLessThan(0.5);
  await expect(map).toHaveAttribute('data-engine', 'cesium');
  await expect(map).toHaveAttribute('data-polar-coverage', 'full');
});

test('Shift and Ctrl + drag orbit around a stable 3D ground anchor', async ({page, isMobile}) => {
  test.skip(isMobile, 'Desktop keyboard gesture');
  await page.goto('/');
  await page.getByRole('button', {name: /Global Demo/}).click();

  const map = page.locator('.map-surface');
  const canvas = page.locator('.cesium-widget canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const initialPitch = Number(await map.getAttribute('data-pitch'));

  await page.keyboard.down('Shift');
  await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.32, {steps: 12});
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect.poll(async () => Number(await map.getAttribute('data-pitch'))).not.toBe(initialPitch);

  const headingAfterTilt = Number(await map.getAttribute('data-heading'));
  await page.keyboard.down('Control');
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.68, box!.y + box!.height * 0.5, {steps: 12});
  await page.mouse.up();
  await page.keyboard.up('Control');

  await expect.poll(async () => Number(await map.getAttribute('data-heading'))).not.toBe(headingAfterTilt);
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
