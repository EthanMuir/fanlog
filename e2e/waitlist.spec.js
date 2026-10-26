import { computeFanScore } from '../cardVisuals.js';
import { expect, test } from './fixtures.js';
import { buildCard } from './flows.js';

const TEAMS = [{ league: 'nhl', team: 'leafs', since: 2005 }];

test.describe('joining the waitlist', () => {
  test('sends the card with the signup and confirms', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Wait_Fan');
    await page.locator('#fan-email').fill('  Wait.Fan@Example.COM ');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#share-email-success')).toBeVisible();
    await expect(page.locator('#share-email-form')).toBeHidden();
    await expect(page.locator('#f-card-verified-badge')).toBeVisible();

    const [signup] = supabase.calls('/functions/v1/waitlist-signup');
    const score = Number(await page.locator('#f-card-legend .legend-chip-score').textContent());
    const fanId = supabase.events()[0].user_id;
    expect(signup.body).toEqual({
      token: '',
      name: '@Wait_Fan',
      handle: '@Wait_Fan',
      email: 'wait.fan@example.com',
      top_team: 'Toronto Maple Leafs',
      teams: [{ id: 'leafs', name: 'Toronto Maple Leafs', league: 'NHL', score, isTop: true }],
      prediction: 'TOR champion in 2030',
      overall_score: computeFanScore([{ score }]),
      archetype: expect.any(String),
      fan_id: fanId,
    });
    // Analytics get the signup, never the email
    await expect.poll(() => supabase.events('waitlist_signup').length).toBe(1);
    expect(JSON.stringify(supabase.events())).not.toContain('example.com');
  });

  test('only signs up once per card', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Once_Fan');
    await page.locator('#fan-email').fill('once@example.com');
    await page.locator('#fan-email').press('Enter');
    await expect(page.locator('#share-email-success')).toBeVisible();
    await page.evaluate(() => document.getElementById('share-email-form').requestSubmit());
    await page.waitForTimeout(300);
    expect(supabase.calls('/functions/v1/waitlist-signup')).toHaveLength(1);
  });

  test('a failed signup says so and can be retried', async ({ page, supabase }) => {
    supabase.waitlist = { status: 500, body: { error: 'db_error' } };
    await buildCard(page, TEAMS, 'Retry_Fan');
    await page.locator('#fan-email').fill('retry@example.com');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#share-email-error')).toHaveText('Something went wrong adding you to the waitlist. Please try again.');
    await expect(page.locator('#share-email-success')).toBeHidden();
    await expect(page.locator('#submit-btn')).toBeEnabled();
    await expect(page.locator('#submit-btn')).toHaveText('Join Waitlist');
    await expect.poll(() => supabase.events('waitlist_signup_failed').length).toBe(1);

    supabase.waitlist = { status: 200, body: { ok: true } };
    await page.locator('#submit-btn').click();
    await expect(page.locator('#share-email-success')).toBeVisible();
    await expect(page.locator('#share-email-error')).toBeHidden();
    expect(supabase.calls('/functions/v1/waitlist-signup')).toHaveLength(2);
  });

  test('a repeat email still counts as joined', async ({ page, supabase }) => {
    supabase.waitlist = { status: 200, body: { ok: true, duplicate: true } };
    await buildCard(page, TEAMS, 'Again_Fan');
    await page.locator('#fan-email').fill('again@example.com');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#share-email-success')).toBeVisible();
  });

  test('the email field must look like an email', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Bad_Email');
    await page.locator('#fan-email').fill('not an email');
    await page.locator('#submit-btn').click();
    expect(await page.locator('#fan-email').evaluate((el) => el.validity.valid)).toBe(false);
    expect(supabase.calls('/functions/v1/waitlist-signup')).toHaveLength(0);
  });

  test('starting a new card re-opens the form', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Rearm_Fan');
    await page.locator('#fan-email').fill('rearm@example.com');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#share-email-success')).toBeVisible();
    await page.locator('#b-restart-flow').click();
    await expect(page.locator('#step-builder')).toHaveClass(/active/);
    await page.locator('#site-logo').click();
    await page.locator('#btn-random-card').click();
    await expect(page.locator('#share-email-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeEnabled();
  });

  test('the header button jumps to the form', async ({ page }) => {
    await buildCard(page, TEAMS, 'Header_Fan');
    await page.locator('#btn-header-waitlist').click();
    await expect(page.locator('#fan-email')).toBeFocused();
    await expect(page.locator('#fan-email')).toBeInViewport();
  });
});
