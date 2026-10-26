import { computeFanScore } from '../cardVisuals.js';
import { expect, test } from './fixtures.js';
import { buildCard, decodeCircle } from './flows.js';

const TEAMS = [{ league: 'nfl', team: 'bills', since: 1999 }];

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function copiedLink(page) {
  await page.locator('#b-copy-link').click();
  await expect(page.locator('#b-copy-link')).toContainText('Link Copied!');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return { text, url: new URL(text.match(/https?:\/\/\S+/)[0]) };
}

test.describe('sharing your card', () => {
  test('saves the card once and copies a short /share link with your handle', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Share_Fan');
    await expect.poll(() => supabase.calls('/rest/v1/circles').length).toBe(1);
    const [save] = supabase.calls('/rest/v1/circles');
    const score = Number(await page.locator('#f-card-legend .legend-chip-score').textContent());
    expect(save.body.id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(save.body.payload).toEqual({
      h: 'Share_Fan',
      a: expect.any(String),
      t: [{ i: 'bills', s: score, top: 1 }],
    });
    // The link never carries the fan id (it proves ownership of the username)
    expect(JSON.stringify(save.body)).not.toContain(supabase.events()[0].user_id);

    const { text, url } = await copiedLink(page);
    expect(text).toMatch(/^I'm a top \d+% Bills fan\. Judge my Sports Loyalty Card\. 👇\nI'll judge yours\. /);
    expect(url.origin + url.pathname).toBe(new URL('/share', page.url()).href);
    expect(Object.fromEntries(url.searchParams)).toEqual({ ref: 'Share_Fan', utm_source: 'fanlog_share', id: save.body.id });
    await expect.poll(() => supabase.events('card_shared').map((e) => e.meta.platform)).toEqual(['copy_link']);
  });

  test('falls back to a self-contained ?c= link when the card cannot be saved', async ({ page, supabase }) => {
    supabase.circlesStatus = 500;
    await buildCard(page, TEAMS, 'Offline_Fan');
    await expect.poll(() => supabase.calls('/rest/v1/circles').length).toBeGreaterThan(0);
    const { url } = await copiedLink(page);
    expect(url.searchParams.has('id')).toBe(false);
    const payload = decodeCircle(url.searchParams.get('c'));
    expect(payload.h).toBe('Offline_Fan');
    expect(payload.t).toEqual([{ i: 'bills', s: expect.any(Number), top: 1 }]);
    await expect(page.locator('#f-card-score')).toHaveText(String(computeFanScore(payload.t.map((t) => ({ score: t.s })))));
  });

  test('the share button opens the native share sheet with the caption and link', async ({ page, supabase }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (data) => {
        window.__shared.push(data);
      };
    });
    await buildCard(page, TEAMS, 'Native_Fan');
    await expect.poll(() => supabase.calls('/rest/v1/circles').length).toBe(1);
    await page.locator('#b-share-sports-circle').click();
    const [shared] = await page.evaluate(() => window.__shared);
    expect(Object.keys(shared)).toEqual(['text']);
    expect(shared.text).toContain('Judge my Sports Loyalty Card');
    expect(shared.text).toContain(`/share?ref=Native_Fan&utm_source=fanlog_share&id=${supabase.calls('/rest/v1/circles')[0].body.id}`);
    await expect.poll(() => supabase.events('card_shared').map((e) => e.meta.platform)).toEqual(['native_share_text']);
  });

  test('without a share sheet, it downloads the card image and copies the caption', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Desktop_Fan');
    const download = page.waitForEvent('download');
    await page.locator('#b-share-sports-circle').click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/share?ref=Desktop_Fan');
    await expect.poll(() => supabase.events('card_shared').map((e) => e.meta.platform)).toEqual(['desktop_fallback']);
  });

  test('downloads the card as a PNG named after the handle', async ({ page }) => {
    await buildCard(page, TEAMS, 'Png_Fan');
    const download = page.waitForEvent('download');
    await page.locator('#b-download-png').click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('png_fan');
    expect(file.suggestedFilename()).toMatch(/\.png$/);
    const path = await file.path();
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(path);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  test('renaming the Fan ID on the card re-saves the share link', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Old_Name');
    await expect.poll(() => supabase.calls('/rest/v1/circles').length).toBe(1);
    const name = page.locator('#f-card-name');
    await name.click();
    await expect(name).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.type('New_Name');
    await page.keyboard.press('Enter');
    await expect(name).toHaveText('@New_Name');
    await expect.poll(() => supabase.calls('/rest/v1/circles').length).toBe(2);
    expect(supabase.calls('/rest/v1/circles')[1].body.payload.h).toBe('New_Name');
    expect(supabase.calls('/rest/v1/rpc/claim_handle').map((c) => c.body.p_handle)).toEqual(['Old_Name', 'New_Name']);
    const { url } = await copiedLink(page);
    expect(url.searchParams.get('ref')).toBe('New_Name');
    expect(url.searchParams.get('id')).toBe(supabase.calls('/rest/v1/circles')[1].body.id);
  });

  test('a taken name on the card is refused and the old one kept', async ({ page, supabase }) => {
    await buildCard(page, TEAMS, 'Keep_Me');
    supabase.claimResult = 'taken';
    let alert = '';
    page.on('dialog', (d) => {
      alert = d.message();
      d.accept();
    });
    const name = page.locator('#f-card-name');
    await name.click();
    await page.keyboard.type('Someone_Else');
    await page.keyboard.press('Enter');
    await expect.poll(() => alert).toBe('@Someone_Else is already taken. Try another.');
    await expect(name).toHaveText('@Keep_Me');
  });
});
