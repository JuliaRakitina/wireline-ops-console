/* global document */
import { URL } from 'node:url';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  const initial = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    heap: performance.memory?.usedJSHeapSize ?? null,
  }));
  const started = performance.now();
  const interactionMilliseconds = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(15000);
    const start = performance.now();
    await page.getByRole('button', { name: 'Inspect shallower depths' }).click();
    await page.getByRole('button', { name: /Back to Live/ }).click();
    interactionMilliseconds.push(Math.round(performance.now() - start));
  }
  const final = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    heap: performance.memory?.usedJSHeapSize ?? null,
  }));
  const result = {
    date: '2026-09-16',
    browser: 'Chromium',
    viewport: '1440×900',
    durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    initial,
    final,
    interactionPairMilliseconds: interactionMilliseconds,
    pageErrors: errors.length,
    recording: await page.locator('.recording-footer').innerText(),
  };
  await writeFile(
    new URL('../docs/performance-results.json', import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
