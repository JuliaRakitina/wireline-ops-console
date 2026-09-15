import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('primary screens meet automated WCAG AA checks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const screen of ['Live Operations', 'Run Review', 'Well Profile', 'Configuration']) {
    await page.getByRole('button', { name: screen, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      screen,
    ).toEqual([]);
  }
});
