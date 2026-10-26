import { expect, test } from './fixtures.js';
import { buildCard } from './flows.js';

test.describe('on a phone', () => {
  test('the whole flow works', async ({ page }) => {
    await buildCard(page, [{ league: 'nba', team: 'raptors', since: 2019 }], 'Phone_Fan');
    await expect(page.locator('#f-card-name')).toHaveText(/@Phone_Fan/i);
    await expect(page.locator('#b-share-sports-circle')).toBeVisible();
  });

  test('header actions sit behind a menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-random-card').click();
    const toggle = page.locator('#header-menu-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed with opacity (so it can fade), not display
    const menu = page.locator('#header-menu');
    await expect(menu).toHaveCSS('opacity', '0');
    await expect(menu).toHaveCSS('pointer-events', 'none');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toHaveCSS('opacity', '1');
    await expect(menu).toHaveCSS('pointer-events', 'auto');
    // Tapping outside closes it
    await page.locator('#final-card').click({ position: { x: 5, y: 5 } });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Choosing an action closes it too
    await toggle.click();
    await page.locator('#btn-header-waitlist').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#fan-email')).toBeFocused();
  });

  test('the page never scrolls sideways', async ({ page }) => {
    await page.goto('/');
    for (const step of ['welcome', 'builder']) {
      if (step === 'builder') await page.locator('#btn-start-flow').click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, step).toBeLessThanOrEqual(0);
    }
    await page.locator('#site-logo').click();
    await page.locator('#btn-random-card').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'card').toBeLessThanOrEqual(0);
  });
});
