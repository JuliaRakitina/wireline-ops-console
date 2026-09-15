import { test, expect, type Page } from '@playwright/test';

async function openDemo(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Live Operations', exact: true })).toBeVisible();
}
async function inject(page: Page, scenario: string) {
  await page.getByLabel('Scenario', { exact: true }).selectOption(scenario);
  await page.getByRole('button', { name: 'Inject scenario' }).click();
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

test('recruiter journey: live, held history, baseline, critical event, saved replay and CSV', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDemo(page);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.clock.runFor(1800);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'normal');
  await screenshot(page, 'live-desktop');
  await page.getByRole('button', { name: 'Set baseline' }).click();
  await expect(page.getByText('Differential baseline set', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect shallower depths' }).click();
  const held = await page.getByTestId('depth-chart').getAttribute('data-depth-domain');
  const depthBefore = await page.getByTestId('measured-depth').textContent();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('depth-chart')).toHaveAttribute('data-depth-domain', held!);
  await expect(page.getByTestId('measured-depth')).not.toHaveText(depthBefore!);
  await screenshot(page, 'history-desktop');
  await page.getByRole('button', { name: /Back to Live/ }).click();
  await expect(page.getByTestId('chart-mode')).toHaveAttribute('data-mode', 'live');
  await inject(page, 'snag');
  await page.clock.runFor(2600);
  await expect(page.locator('.alert-severity').first()).toContainText('WARNING');
  await expect(page.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'warning');
  await screenshot(page, 'warning-desktop');
  await page.clock.runFor(3500);
  await expect(page.locator('.alert-severity').first()).toContainText('CRITICAL');
  await expect(page.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'critical');
  await screenshot(page, 'critical-desktop');
  await page.getByRole('button', { name: 'Acknowledge alerts' }).click();
  await expect(page.locator('.alert-severity').first()).toContainText('ACK');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByTestId('tension-gauge')).toContainText('Paused · last reading');
  await page.getByRole('button', { name: 'Save run', exact: true }).click();
  await expect(page.getByText('Run saved in this browser', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run Review', exact: true }).click();
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Pause replay' }).click();
  await page.getByLabel('Replay speed').selectOption('4');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('wireline-synthetic-run.csv');
  await screenshot(page, 'review-desktop');
  await page.reload();
  await page.getByRole('button', { name: 'Run Review', exact: true }).click();
  await page.getByRole('button', { name: 'Load saved run' }).click();
  await expect(page.getByText('Restored latest saved run from this browser')).toBeVisible();
  expect(errors).toEqual([]);
});

test('configuration propagates into instruments, well, chart annotations, and proximity rules', async ({
  page,
}) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Configuration', exact: true }).click();
  await page.getByLabel('Casing Shoe').fill('510');
  await page.getByLabel('Total Depth', { exact: false }).fill('700');
  await page.getByLabel('Line tension warning').fill('18');
  await page.getByLabel('Line tension critical').fill('24');
  await page.getByRole('button', { name: 'Apply configuration' }).click();
  await expect(page.getByText('Configuration applied to charts, well, and alerts.')).toBeVisible();
  await screenshot(page, 'configuration-desktop');
  await page.getByRole('button', { name: 'Live Operations', exact: true }).click();
  await expect(page.locator('.tension-instrument')).toContainText('18.0');
  await expect(page.locator('.tension-instrument')).toContainText('24.0');
  await expect(page.getByTestId('tension-gauge')).toHaveAttribute('data-full-scale', '30');
  await expect(page.getByTestId('schematic-shoe')).toHaveText('510 m');
  await expect(page.getByTestId('schematic-td')).toHaveText('700 m');
  await expect(page.locator('.boundary-label')).toContainText('CASING SHOE');
  await expect(page.locator('.alert-list')).toContainText('Casing Shoe');
  await page.getByRole('button', { name: 'Well Profile', exact: true }).click();
  await expect(page.getByText('SYNTHETIC · PROTOTYPE')).toBeVisible();
  await screenshot(page, 'well-profile-desktop');
});

test('encoder degradation stays visible after magnetic correction; loss is critical', async ({
  page,
}) => {
  await openDemo(page);
  await inject(page, 'encoder');
  await page.clock.runFor(8500);
  await expect(page.getByText('Depth confidence degraded', { exact: true })).toBeVisible();
  await expect(page.locator('.event-list')).toContainText('Magnetic depth reference');
  await screenshot(page, 'degraded-desktop');
  await inject(page, 'loss');
  await page.clock.runFor(1000);
  await expect(page.locator('.alert-list')).toContainText(/loss|load/i);
  await expect(page.locator('.alert-severity').first()).toContainText('CRITICAL');
  await expect(page.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'critical');
  await expect(page.getByTestId('tension-gauge')).toContainText('Critical · loss of load');
  await screenshot(page, 'loss-desktop');
});

for (const viewport of [
  { name: 'tablet', width: 1180, height: 820 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name} layout has no page overflow and controls remain usable`, async ({
    page,
  }) => {
    await openDemo(page, viewport.width, viewport.height);
    await page.getByRole('button', { name: 'Start run', exact: true }).click();
    await page.clock.runFor(1000);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(page, `live-${viewport.name}`);
    await page.getByRole('button', { name: 'Well Profile', exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(page, `well-profile-${viewport.name}`);
  });
}

test('D3 wheel/drag, synchronized cursor, clipping, and independent scales', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.clock.runFor(1200);
  const chart = page.getByTestId('depth-chart');
  const initial = await chart.getAttribute('data-depth-domain');
  const rect = await page.locator('.chart-interaction').boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await expect(page.locator('.chart-readout')).toContainText('INSPECT');
  await expect(page.locator('.depth-cursor')).toHaveCount(3);
  await page.mouse.wheel(0, -200);
  await page.clock.runFor(200);
  await expect(chart).not.toHaveAttribute('data-depth-domain', initial!);
  const zoomed = await chart.getAttribute('data-depth-domain');
  await page.mouse.down();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(chart).not.toHaveAttribute('data-depth-domain', zoomed!);
  const held = await chart.getAttribute('data-depth-domain');
  await page.clock.runFor(1500);
  await expect(chart).toHaveAttribute('data-depth-domain', held!);
  await page.getByRole('button', { name: 'Scales', exact: true }).click();
  await page.getByLabel('Line Tension maximum').fill('24');
  await expect(page.getByLabel('Line Tension maximum')).toHaveValue('24');
  await expect(page.getByLabel('Differential Tension maximum')).toHaveValue('8');
  await page.getByRole('button', { name: 'Speed', exact: true }).click();
  await expect(page.locator('.telemetry-track')).toHaveCount(2);
  expect(
    await page
      .locator('.clipped-track')
      .evaluateAll((nodes) => nodes.every((n) => n.getAttribute('clip-path')?.startsWith('url(#'))),
  ).toBe(true);
});

test('replay preserves historical settings and hover does not stop its clock', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.clock.runFor(1200);
  await page.getByRole('button', { name: 'Configuration', exact: true }).click();
  await page.getByLabel('Casing Shoe').fill('510');
  await page.getByRole('button', { name: 'Apply configuration' }).click();
  await page.clock.runFor(1200);
  await page.getByRole('button', { name: 'Run Review', exact: true }).click();
  await expect(page.locator('.replay-config')).toContainText('Casing Shoe 510 m');
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.clock.runFor(400);
  await expect(page.locator('.replay-config')).toContainText('Casing Shoe 560 m');
  const before = Number(await page.getByLabel('Run timeline').inputValue());
  await page.locator('.chart-interaction').hover();
  await page.clock.runFor(800);
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
  expect(Number(await page.getByLabel('Run timeline').inputValue())).toBeGreaterThan(before);
});

test('remaining scenario presets and requested direction can be controlled without code', async ({
  page,
}) => {
  await openDemo(page);
  await inject(page, 'reverse');
  await page.clock.runFor(6500);
  await expect(page.locator('.connection-state')).toContainText('Retrieving');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.connection-state')).toContainText('Retrieving');
  await inject(page, 'boundary');
  await page.clock.runFor(1000);
  await expect(page.locator('.alert-list')).toContainText('Total Depth');
  await page.clock.runFor(15000);
  await expect(page.locator('.alert-severity').first()).toContainText('CRITICAL');
  await page.getByRole('button', { name: 'Reset deterministic run' }).click();
  await inject(page, 'normal');
  await page.clock.runFor(1000);
  await expect(page.getByRole('heading', { name: 'Within operating limits' })).toBeVisible();
});
