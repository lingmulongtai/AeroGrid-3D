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
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  for (const endpoint of ['satellites', 'clouds', 'ships', 'cameras']) {
    await page.route(`**/api/v1/${endpoint}**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'live-beta', source: endpoint === 'satellites' ? 'celestrak' : endpoint === 'clouds' ? 'open-meteo-gfs' : 'fintraffic', status: 'unavailable', generatedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), coverage: { kind: 'global' }, items: [] }) }));
  }
});

test('satellite trails remain independent of aircraft and quality presets', async ({ page, isMobile }) => {
  await enterDemo(page);
  if (isMobile) await page.getByRole('button', { name: 'Expand panel' }).click();
  const trail = page.getByRole('button', { name: 'Satellite trails & orbit', exact: true });
  await expect(trail).toHaveAttribute('aria-pressed', 'true');
  await trail.click();
  await expect(trail).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Aircraft trails', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as any).__globe.satellites.showTrails)).toBe(false);
  if (isMobile) await page.getByRole('button', { name: 'Collapse panel' }).click();
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Balanced/ }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__globe.satellites.showTrails)).toBe(false);
});

test('API settings keep raw keys out of browser storage', async ({ page }) => {
  let submitted: Record<string, string> = {};
  await page.route('**/api/v1/connections', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), flightSource: 'adsbexchange', shipSource: 'aisstream' }) });
  });
  await enterDemo(page);
  await page.getByRole('button', { name: 'Display settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Aircraft', exact: true }).selectOption('adsbexchange');
  await dialog.getByLabel('RapidAPI key').fill('test-rapid-secret');
  await dialog.getByRole('combobox', { name: 'Ships', exact: true }).selectOption('aisstream');
  await dialog.getByLabel('AISStream key').fill('test-ais-secret');
  await dialog.getByRole('button', { name: 'Apply connections' }).click();
  await expect(dialog.locator('.data-settings').first().getByRole('status')).toContainText('Connection configured');
  expect(submitted).toMatchObject({ rapidApiKey: 'test-rapid-secret', aisStreamKey: 'test-ais-secret' });
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain('test-rapid-secret'); expect(storage).not.toContain('test-ais-secret');
  await expect(dialog.getByLabel('RapidAPI key')).toHaveValue('');
});

test('cloud shader renders close tilted volumes without compilation errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && /Shader|WebGLProgram/.test(message.text())) errors.push(message.text()); });
  await enterDemo(page);
  await page.evaluate(() => {
    const globe = (window as any).__globe;
    globe.weather.useProfiles([{ longitude: 139.76, latitude: 35.68, validTime: new Date().toISOString(), groundAltitudeKm: 0, footprintKm: 10, levels: [{ pressureHpa: 850, altitudeKm: 1.5, coverPercent: 80 }] }]);
    globe.controls.rig.range = 5;
    globe.controls.rig.tilt = 65;
    globe.controls.applyRig();
    globe.callbacks.onCamera(globe.controls.snapshot());
  });
  await expect.poll(async () => (await cameraState(page)).height).toBeLessThan(10_000);
  await page.locator('.globe-canvas').screenshot();
  expect(errors).toEqual([]);
  await expectHealthyPage(page);
});

test('live ships and public cameras can be picked on the globe', async ({ page, isMobile }) => {
  const now = new Date().toISOString();
  const snapshot = (source: string, items: unknown[]) => ({ mode: 'live-beta', source, status: 'available', generatedAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString(), coverage: { kind: 'region', name: 'Finland' }, items });
  await page.route('**/api/v1/flights?**', (route) => route.fulfill({ json: { ...snapshot('adsb.lol', []), status: 'unavailable' } }));
  await page.route('**/api/v1/weather**', (route) => route.fulfill({ json: { ...snapshot('rainviewer', []), status: 'unavailable' } }));
  await page.route('**/api/v1/ships?**', (route) => route.fulfill({ json: snapshot('fintraffic', [{ id: '230123456', name: 'Public AIS vessel', longitude: 25, latitude: 60, heading: 90, speedKnots: 8, receivedAt: now, source: 'fintraffic' }]) }));
  await page.route('**/api/v1/cameras', (route) => route.fulfill({ json: snapshot('fintraffic', [{ id: 'C01503', name: 'Public weather camera', longitude: 25.5, latitude: 60, imageUrl: 'https://weathercam.digitraffic.fi/C0150301.jpg', pageUrl: 'https://liikennetilanne.fintraffic.fi/', source: 'fintraffic' }]) }));
  await page.route('https://weathercam.digitraffic.fi/**', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await page.getByRole('button', { name: /Live Beta/ }).click();
  if (isMobile) await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.getByRole('button', { name: /^Ships / }).click();
  await page.getByRole('button', { name: /^Public cameras / }).click();
  if (isMobile) await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__globe.publicContacts.shipRecords.length)).toBe(1);
  await page.evaluate(() => {
    const globe = (window as any).__globe;
    const lat = Math.PI / 3, lon = 25 * Math.PI / 180;
    globe.controls.rig.target.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    globe.controls.rig.range = 200; globe.controls.rig.tilt = 35; globe.controls.applyRig();
  });
  const pick = async (kind: 'ship' | 'camera', id: string) => {
    const point = await page.evaluate(({ kind, id }) => {
      const globe = (window as any).__globe;
      const p = globe.publicContacts.getPosition(kind, id).project(globe.camera);
      const canvas = globe.renderer.domElement;
      return { x: (p.x * 0.5 + 0.5) * canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * canvas.clientHeight };
    }, { kind, id });
    await page.mouse.click(point.x, point.y);
  };
  await pick('ship', '230123456');
  await expect(page.getByRole('complementary', { name: 'Public AIS vessel' })).toContainText('230123456');
  await page.getByRole('complementary', { name: 'Public AIS vessel' }).getByRole('button', { name: 'Close' }).click();
  await pick('camera', 'C01503');
  await expect(page.getByRole('complementary', { name: 'Public weather camera' })).toContainText('Image unavailable');
  await expect(page.getByRole('link', { name: 'Open original source' })).toHaveAttribute('href', 'https://liikennetilanne.fintraffic.fi/');
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
  // CI renders with software WebGL, so exercise preset switching with a light preset.
  await dialog.getByRole('button', { name: /Balanced/ }).click();
  await expect(dialog.getByRole('button', { name: /Balanced/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /Ultra/ })).toHaveAttribute('aria-pressed', 'false');
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
