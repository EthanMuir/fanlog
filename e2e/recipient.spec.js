import { computeFanScore } from '../cardVisuals.js';
import { expect, test } from './fixtures.js';
import { encodeCircle } from './flows.js';

const CARD = { h: 'Sharer_1', a: 'Noble Sufferer', t: [{ i: 'bills', s: 91, top: 1 }, { i: 'knicks', s: 74, top: 0 }] };

async function expectSharedCard(page, card) {
  await expect(page.locator('#step-main')).toHaveClass(/active/);
  await expect(page.locator('.main-reveal-title')).toHaveText(`@${card.h}'s Loyalty Card`);
  await expect(page.locator('#f-card-name')).toHaveText(`@${card.h}`);
  await expect(page.locator('#f-card-score')).toHaveText(String(computeFanScore(card.t.map((t) => ({ score: t.s })))));
  const scores = await page.locator('#f-card-legend .legend-chip-score').allTextContents();
  expect(scores.map(Number).sort()).toEqual(card.t.map((t) => t.s).sort());
  // Their card: invite to make your own, no share/waitlist controls
  await expect(page.locator('#shared-recipient-cta')).toBeVisible();
  await expect(page.locator('#share-primary')).toBeHidden();
  await expect(page.locator('#share-email-area')).toBeHidden();
}

test.describe("opening someone's shared card", () => {
  test('a ?c= link shows their card without a network round trip', async ({ page, supabase }) => {
    await page.goto(`/?ref=Sharer_1&utm_source=fanlog_share&c=${encodeCircle(CARD)}`);
    await expectSharedCard(page, CARD);
    expect(supabase.calls('/rest/v1/rpc/get_circle')).toHaveLength(0);
    await expect.poll(() => supabase.events('referral_landing').map((e) => e.meta)).toEqual([{ ref: 'Sharer_1' }]);
  });

  test('a short ?id= link is looked up through get_circle', async ({ page, supabase }) => {
    supabase.circles.abc12345 = CARD;
    await page.goto('/?id=abc12345');
    await expectSharedCard(page, CARD);
    expect(supabase.calls('/rest/v1/rpc/get_circle').map((c) => c.body)).toEqual([{ p_id: 'abc12345' }]);
  });

  test("viewing a shared card doesn't count as making one or save a copy", async ({ page, supabase }) => {
    await page.goto(`/?c=${encodeCircle(CARD)}`);
    await expectSharedCard(page, CARD);
    await page.waitForTimeout(1000); // past the idle-time share prefetch
    expect(supabase.events('circle_created')).toEqual([]);
    expect(supabase.calls('/rest/v1/circles')).toEqual([]);
  });

  test("their Fan ID can't be edited", async ({ page, supabase }) => {
    await page.goto(`/?c=${encodeCircle(CARD)}`);
    await expectSharedCard(page, CARD);
    await page.locator('#f-card-name').click();
    await expect(page.locator('#f-card-name')).toHaveAttribute('contenteditable', 'false');
    expect(supabase.calls('/rest/v1/rpc/claim_handle')).toEqual([]);
  });

  test('tampered links are cleaned up before they are shown', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      d.dismiss();
    });
    const evil = {
      h: '<img src=x onerror=alert(1)>',
      a: '<b>Visit evil.example</b>',
      t: [{ i: 'bills', s: 9000, top: 1 }, { i: '<script>', s: 50 }],
    };
    await page.goto(`/?c=${encodeCircle(evil)}`);
    await expect(page.locator('#step-main')).toHaveClass(/active/);
    await expect(page.locator('#f-card-name')).toHaveText('@imgsrcxonerroralert1');
    await expect(page.locator('#f-card-score')).toHaveText('100');
    await expect(page.locator('#f-card-legend .legend-chip')).toHaveCount(1);
    await expect(page.locator('#f-card-archetype')).not.toContainText('EVIL');
    expect(await page.locator('img[src="x"], #step-main b').count()).toBe(0);
    expect(dialogs).toBe(0);
  });

  for (const [what, qs] of [
    ['garbage ?c=', 'c=%%%not-base64'],
    ['a card with only unknown teams', `c=${encodeCircle({ h: 'x', a: '', t: [{ i: 'not_a_team', s: 50 }] })}`],
    ['an id that does not exist', 'id=missing99'],
    ['an id that cannot exist', 'id=../../etc'],
  ]) {
    test(`${what} leaves the normal landing page`, async ({ page }) => {
      await page.goto(`/?${qs}`);
      await page.waitForTimeout(500);
      await expect(page.locator('#step-welcome')).toHaveClass(/active/);
    });
  }

  test('"Create My Loyalty Card" starts a fresh card of your own', async ({ page }) => {
    await page.goto(`/?c=${encodeCircle(CARD)}`);
    await expectSharedCard(page, CARD);
    await page.locator('#b-shared-create').click();
    await expect(page.locator('#step-builder')).toHaveClass(/active/);
    await expect(page.locator('#b-since-display')).toHaveText('Select Year');
  });

  test('"Surprise Me" makes a random card that is yours to share', async ({ page }) => {
    await page.goto(`/?c=${encodeCircle(CARD)}`);
    await expectSharedCard(page, CARD);
    await page.locator('#b-shared-surprise').click();
    await expect(page.locator('.main-reveal-title')).toHaveText('Your Loyalty Card Is Ready.');
    await expect(page.locator('#share-primary')).toBeVisible();
    await expect(page.locator('#shared-recipient-cta')).toBeHidden();
    await expect(page.locator('#f-card-name')).not.toHaveText('@Sharer_1');
  });
});
