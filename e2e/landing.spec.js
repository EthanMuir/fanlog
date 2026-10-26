import { KNOWN_ARCHETYPES } from '../archetypes.js';
import { computeFanScore } from '../cardVisuals.js';
import { expect, test } from './fixtures.js';

const known = [...KNOWN_ARCHETYPES].map((a) => a.toUpperCase());

test.describe('the landing page', () => {
  test('shows the pitch and a live sample card', async ({ page, supabase }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FanLog/i);
    await expect(page.locator('#step-welcome')).toHaveClass(/active/);
    await expect(page.locator('#btn-start-flow')).toHaveText('Create My Loyalty Card');
    await expect(page.locator('#btn-random-card')).toHaveText('Surprise Me');
    await expect(page.locator('#welcome-card')).toBeVisible();
    // Header actions only appear once there's a card
    await expect(page.locator('#header-cta-container')).toBeHidden();
    // One page view, tagged with this browser's anonymous fan id
    await expect.poll(() => supabase.events('/').length).toBe(1);
    const [view] = supabase.events('/');
    expect(view).toMatchObject({ app_id: 'fanlog-app-id', type: 'page_view' });
    expect(view.user_id).toBe(await page.evaluate(() => localStorage.getItem('fanlog_fan_id')));
  });

  test('keeps the same fan id across visits', async ({ page, supabase }) => {
    await page.goto('/');
    await expect.poll(() => supabase.events('/').length).toBe(1);
    await page.reload();
    await expect.poll(() => supabase.events('/').length).toBe(2);
    const ids = supabase.events('/').map((e) => e.user_id);
    expect(ids[0]).toBe(ids[1]);
  });

  test('the sample card cycles through example fans', async ({ page }) => {
    // The loop only runs for people who haven't asked for reduced motion
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const name = page.locator('#w-card-name');
    const first = await name.textContent();
    await expect.poll(() => name.textContent(), { timeout: 15_000 }).not.toBe(first);
  });

  test('"Surprise Me" makes a full random card', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-random-card').click();
    await expect(page.locator('#step-main')).toHaveClass(/active/);
    await expect(page.locator('#f-card-legend .legend-chip')).toHaveCount(3);
    const scores = (await page.locator('#f-card-legend .legend-chip-score').allTextContents()).map(Number);
    expect(scores.sort()).toEqual([55, 74, 92]);
    await expect(page.locator('#f-card-score')).toHaveText(String(computeFanScore(scores.map((score) => ({ score })))));
    expect(known).toContain((await page.locator('#f-card-archetype').textContent()).trim());
    await expect(page.locator('#f-card-name')).toHaveText(/^@\w+$/);
    await expect(page.locator('#header-cta-container')).toBeVisible();
  });

  test("a random card's sample Fan ID isn't claimed just by clicking it", async ({ page, supabase }) => {
    await page.goto('/');
    await page.locator('#btn-random-card').click();
    const name = page.locator('#f-card-name');
    await expect(name).not.toHaveText('@GUEST');
    const before = await name.textContent();
    await name.click();
    await page.keyboard.press('Enter');
    await expect(name).toHaveText(before);
    await page.waitForTimeout(300);
    expect(supabase.calls('/rest/v1/rpc/claim_handle')).toEqual([]);
  });

  test('the app demo mirrors your card', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-random-card').click();
    await expect(page.locator('#demo-mockup-iframe')).toHaveAttribute('src', /favorites=/);
    const src = await page.locator('#demo-mockup-iframe').getAttribute('src');
    const url = new URL(src, page.url());
    expect(url.pathname).toBe('/app/');
    const teams = url.searchParams.get('favorites').split(',');
    expect(teams).toHaveLength(3);
    expect(url.searchParams.get('scores')).toBe('92,74,55');
    expect(url.searchParams.get('handle')).toMatch(/^@/);
    // The bundled demo app is served from public/app
    const res = await page.request.get('/app/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  test('the logo goes back home', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await expect(page.locator('#step-builder')).toHaveClass(/active/);
    await page.locator('#site-logo').click();
    await expect(page.locator('#step-welcome')).toHaveClass(/active/);
  });

  test('ships production assets only', async ({ page }) => {
    await page.goto('/');
    // The dev-only test card button and admin panel are stripped from builds
    await expect(page.locator('#dev-test-card-btn')).toHaveCount(0);
    expect(await page.content()).not.toContain('Waitlist Signups');
  });
});
