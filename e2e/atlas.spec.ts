import { expect, test, type Page } from '@playwright/test';

async function expectHealthyPage(page: Page) {
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.locator('vite-error-overlay, .vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('.globe-error')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function enterDemo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toContainText('See the world in motion.');
  await page.getByRole('button', { name: /Global Demo/ }).click();
  await expect(page.locator('.map-surface')).toHaveAttribute('data-engine', 'three');
}

async function cameraState(page: Page) {
  return page.locator('.map-surface').evaluate((element) => ({
    longitude: Number(element.getAttribute('data-longitude')),
    latitude: Number(element.getAttribute('data-latitude')),
    height: Number(element.getAttribute('data-camera-height')),
    heading: Number(element.getAttribute('data-heading')),
    pitch: Number(element.getAttribute('data-pitch')),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('Demo stays separate and supports the primary exploration flow', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await enterDemo(page);
  await expect(page.locator('.mode-badge')).toHaveText('DEMO');
  await expect(page.getByText(/Deterministic simulation/)).toBeVisible();
  await expect(page.locator('.mini-globe')).toBeVisible();

  await page.getByRole('combobox').fill('JAL');
  const firstAircraft = page.getByRole('option').first();
  await expect(firstAircraft).toBeVisible();
  await firstAircraft.click();
  await expect(page.getByRole('button', { name: 'Stop tracking' })).toBeVisible();
  await expect(page.locator('.map-surface')).toHaveAttribute('data-tracking', 'aircraft');

  await page.getByRole('button', { name: 'Stop tracking' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('button', { name: 'Track aircraft' })).toBeVisible();
  await expect(page.locator('.map-surface')).toHaveAttribute('data-tracking', 'none');

  await page.getByRole('combobox').fill('ISS');
  await page.getByRole('option', { name: /ISS/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'ISS' })).toContainText('Simulated orbit');
  await expect(page.locator('.map-surface')).toHaveAttribute('data-tracking', 'satellite');

  await expectHealthyPage(page);
  expect(pageErrors).toEqual([]);
});

test('the sidebar folds upward and switches the interface language', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The mobile panel starts collapsed and is covered separately');
  await enterDemo(page);
  const sidebar = page.locator('.atlas-sidebar');
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');

  await sidebar.getByRole('button', { name: 'NASA Night' }).click();
  await expect(page.locator('.map-surface')).toHaveAttribute('data-map-style', 'night');
  await sidebar.getByRole('button', { name: '日本語' }).click();
  await expect(page.getByRole('button', { name: 'パネルをたたむ' })).toBeVisible();
  await expectHealthyPage(page);
});

test('display settings change quality presets and object limits', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('button', { name: 'Display settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Display settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Ultra/ }).click();
  await expect(dialog.getByRole('button', { name: /Ultra/ })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('Anti-aliasing').selectOption('2');
  await expect(dialog.getByText('Custom settings are active.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aerogrid.quality') ?? '{}'));
  expect(stored).toMatchObject({ msaa: 2, preset: 'custom' });
});

test('zoom changes camera height without moving the view centre', async ({ page }) => {
  await enterDemo(page);
  const initial = await cameraState(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await cameraState(page)).height, { timeout: 20_000 }).toBeLessThan(initial.height);
  const next = await cameraState(page);
  expect(Math.abs(next.longitude - initial.longitude)).toBeLessThan(0.5);
  expect(Math.abs(next.latitude - initial.latitude)).toBeLessThan(0.5);
  await expect(page.locator('.map-surface')).toHaveAttribute('data-polar-coverage', 'full');
});

test('Ctrl + drag tilts in 3D and Alt + drag rotates the view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop keyboard gesture');
  await enterDemo(page);
  const canvas = page.locator('.globe-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const initial = await cameraState(page);

  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.6);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect.poll(async () => (await cameraState(page)).pitch, { timeout: 20_000 }).toBeGreaterThan(initial.pitch);

  const tilted = await cameraState(page);
  await page.mouse.move(box!.x + box!.width * 0.45, box!.y + box!.height * 0.5);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await cameraState(page)).heading, { timeout: 20_000 }).not.toBe(tilted.heading);
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
  await expect(page.locator('.status-count')).toHaveText('0');
  await expectHealthyPage(page);
});

test('all mobile controls remain reachable inside the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only acceptance check');
  await enterDemo(page);
  const sidebar = page.locator('.atlas-sidebar');
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand panel' }).click();
  const bounds = await sidebar.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await sidebar.locator('.sidebar-note').scrollIntoViewIfNeeded();
  await expect(sidebar.locator('.sidebar-note')).toBeVisible();
  for (const name of ['Zoom in', 'Display settings', 'Fullscreen']) {
    const control = await page.getByRole('button', { name }).boundingBox();
    expect(control).not.toBeNull();
    expect(control!.x + control!.width).toBeLessThanOrEqual(390);
    expect(control!.y + control!.height).toBeLessThanOrEqual(844);
  }
  await expectHealthyPage(page);
});
