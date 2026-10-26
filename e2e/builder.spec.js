import { KNOWN_ARCHETYPES } from '../archetypes.js';
import { computeFanScore, getPredictionLabel } from '../cardVisuals.js';
import { expect, test } from './fixtures.js';
import { addTeam, answerQuiz, buildCard, finishCard } from './flows.js';

// Team scores as the hub shows them ("Score: 80"), in list order
async function hubScores(page) {
  const badges = await page.locator('#hub-added-teams-list .hub-team-score-badge').allTextContents();
  return badges.map((b) => Number(b.replace('Score: ', '')));
}

test.describe('building a Loyalty Card', () => {
  test('one team, start to finish', async ({ page, supabase }) => {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await addTeam(page, { league: 'nhl', team: 'leafs', since: 2005 });
    await expect(page.locator('#quiz-team-name')).toHaveText('Toronto Maple Leafs');
    // Every question must be answered before moving on
    await expect(page.locator('#btn-quiz-next')).toBeDisabled();
    await answerQuiz(page, { level: 3, prediction: 2030 });

    const hub = page.locator('#hub-added-teams-list .hub-team-card');
    await expect(hub).toHaveCount(1);
    await expect(hub).toContainText('Toronto Maple Leafs');
    await expect(hub).toContainText('Fan Since: 2005');
    await expect(hub).toContainText('Prediction: 2030');
    await expect(hub.locator('.hub-top-badge')).toHaveText('Top Team');
    const [teamScore] = await hubScores(page);
    expect(teamScore).toBeGreaterThanOrEqual(60);
    expect(teamScore).toBeLessThanOrEqual(100);

    await finishCard(page, 'Leafs_Lifer');
    await expect(page.locator('#f-card-score')).toHaveText(String(computeFanScore([{ score: teamScore }])));
    await expect(page.locator('#f-card-name')).toHaveText('@LEAFS_LIFER', { ignoreCase: true });
    await expect(page.locator('#f-card-since-label')).toHaveText('TOR SINCE');
    await expect(page.locator('#f-card-since')).toHaveText('2005');
    await expect(page.locator('#f-card-prediction-label')).toHaveText(getPredictionLabel('NHL', 'TOR'));
    await expect(page.locator('#f-card-prediction')).toHaveText('2030');
    await expect(page.locator('#f-card-legend .legend-chip')).toHaveCount(1);
    await expect(page.locator('#f-card-legend .legend-chip-name')).toHaveText('TOR');
    await expect(page.locator('#f-card-legend .legend-chip-score')).toHaveText(String(teamScore));
    const archetype = (await page.locator('#f-card-archetype').textContent()).trim();
    expect([...KNOWN_ARCHETYPES].map((a) => a.toUpperCase())).toContain(archetype);
    await expect(page.locator('.main-reveal-title')).toHaveText('Your Loyalty Card Is Ready.');

    // The username went through claim_handle with this browser's fan id
    const [claim] = supabase.calls('/rest/v1/rpc/claim_handle');
    expect(claim.body.p_handle).toBe('Leafs_Lifer');
    expect(claim.body.p_fan_id).toMatch(/^[0-9a-f-]{36}$/);
    // and analytics saw the funnel, all under that same fan id
    const names = supabase.events().map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['/', 'flow_started', 'team_added', 'quiz_completed', 'circle_created']));
    expect(new Set(supabase.events().map((e) => e.user_id))).toEqual(new Set([claim.body.p_fan_id]));
  });

  test('several teams: the highest score is the top team and the card scores all of them', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await addTeam(page, { league: 'nfl', team: 'bills', since: 1999 });
    await answerQuiz(page, { level: 1 });
    await page.locator('#btn-hub-add-team').click();
    await addTeam(page, { league: 'nba', team: 'raptors', since: 2015 });
    await answerQuiz(page, { level: 3 });
    await page.locator('#btn-hub-add-team').click();
    await addTeam(page, { league: 'mlb', team: 'bluejays', since: 1992 });
    await answerQuiz(page, { level: 0 });

    const cards = page.locator('#hub-added-teams-list .hub-team-card');
    await expect(cards).toHaveCount(3);
    const scores = await hubScores(page);
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[0]).toBeGreaterThan(scores[2]);
    await expect(cards.nth(1).locator('.hub-top-badge')).toBeVisible();
    await expect(page.locator('#hub-added-teams-list .hub-top-badge')).toHaveCount(1);

    // Removing the top team hands the badge to the next highest
    await cards.nth(1).locator('.builder-remove-btn').click();
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.hub-top-badge')).toBeVisible();

    await finishCard(page, 'Two_Teams');
    const remaining = await page.locator('#f-card-legend .legend-chip-score').allTextContents();
    expect(remaining.map(Number).sort()).toEqual([scores[0], scores[2]].sort());
    await expect(page.locator('#f-card-score')).toHaveText(String(computeFanScore([scores[0], scores[2]].map((score) => ({ score })))));
    await expect(page.locator('#f-card-since-label')).toHaveText('BUF SINCE');
  });

  test('allows at most four teams', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    const teams = [
      { league: 'nhl', team: 'leafs' },
      { league: 'nhl', team: 'oilers' },
      { league: 'nba', team: 'raptors' },
      { league: 'mls', team: 'toronto_fc', since: 2010 },
    ];
    for (const [i, t] of teams.entries()) {
      if (i) await page.locator('#btn-hub-add-team').click();
      await addTeam(page, t);
      await answerQuiz(page);
    }
    let alert = '';
    page.once('dialog', (d) => {
      alert = d.message();
      d.accept();
    });
    await page.locator('#btn-hub-add-team').click();
    await expect.poll(() => alert).toContain('maximum limit of 4 teams');
    await expect(page.locator('#step-hub')).toHaveClass(/active/);
  });

  test('removing every team blocks finishing', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await addTeam(page, { league: 'nhl', team: 'leafs' });
    await answerQuiz(page);
    await page.locator('#hub-added-teams-list .builder-remove-btn').click();
    await expect(page.locator('#hub-added-teams-list')).toContainText('No teams in your profile yet');
    await expect(page.locator('#btn-hub-finish')).toBeDisabled();
  });

  test('the team must be picked before the quiz opens', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await expect(page.locator('#b-team-select')).toBeDisabled();
    await expect(page.locator('#btn-to-quiz')).toBeDisabled();
    await page.selectOption('#b-sport-select', 'nhl');
    await expect(page.locator('#b-team-select')).toBeEnabled();
    await expect(page.locator('#b-team-select option')).toHaveCount(1 + 32);
    await page.selectOption('#b-team-select', 'leafs');
    await expect(page.locator('#builder-preview-team-name')).toHaveText('Toronto Maple Leafs');
  });

  test("fan-since years start at the team's founding", async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await page.selectOption('#b-sport-select', 'nhl');
    await page.selectOption('#b-team-select', 'knights');
    await page.locator('#b-since-trigger').click();
    const years = page.locator('.year-picker-sheet.visible .year-picker-item');
    await expect(years.last()).toHaveText('2017');
    await expect(years.first()).toHaveText('2026');
    // and the default selection lands on a year that exists
    await page.locator('.year-picker-sheet.visible .year-picker-sheet-done').click();
    await expect(page.locator('#b-since-display')).toHaveText(/^20(1[7-9]|2\d)$/);
  });
});

test.describe('the Fan ID step', () => {
  async function toFanId(page) {
    await page.goto('/');
    await page.locator('#btn-start-flow').click();
    await addTeam(page, { league: 'nhl', team: 'leafs' });
    await answerQuiz(page);
    await page.locator('#btn-hub-finish').click();
    await expect(page.locator('#step-fanid')).toHaveClass(/active/);
  }

  test('only accepts 3–20 letters, digits and _', async ({ page }) => {
    await toFanId(page);
    const input = page.locator('#fanid-input');
    const go = page.locator('#btn-fanid-continue');
    await expect(go).toBeDisabled();
    await input.fill('ab');
    await expect(go).toBeDisabled();
    await input.pressSequentially('c');
    await expect(go).toBeEnabled();
    // Characters outside the pattern are dropped as you type
    await input.fill('');
    await input.pressSequentially('my name-is!');
    await expect(input).toHaveValue('mynameis');
    await expect(input).toHaveAttribute('maxlength', '20');
  });

  test('a taken username keeps you on the step with a message', async ({ page, supabase }) => {
    supabase.claimResult = (h) => (h.toLowerCase() === 'bradyfan' ? 'taken' : 'ok');
    await toFanId(page);
    await page.locator('#fanid-input').fill('BradyFan');
    await page.locator('#btn-fanid-continue').click();
    await expect(page.locator('#fanid-error')).toHaveText('@BradyFan is already taken. Try another.');
    await expect(page.locator('#step-fanid')).toHaveClass(/active/);
    await expect(page.locator('#btn-fanid-continue')).toBeEnabled();
    // Typing clears the message; a free name goes through
    await page.locator('#fanid-input').fill('BradyFan2');
    await expect(page.locator('#fanid-error')).toBeHidden();
    await page.locator('#btn-fanid-continue').click();
    await expect(page.locator('#step-main')).toHaveClass(/active/);
    await expect(page.locator('#f-card-name')).toHaveText(/@BradyFan2/i);
  });

  test('a server-side rejection shows the rule', async ({ page, supabase }) => {
    supabase.claimResult = 'invalid';
    await toFanId(page);
    await page.locator('#fanid-input').fill('admin_x');
    await page.locator('#btn-fanid-continue').click();
    await expect(page.locator('#fanid-error')).toHaveText('Use 3–20 letters, numbers or _.');
  });

  test("lets you through when the check can't run", async ({ page, supabase }) => {
    supabase.claimResult = 'error';
    await toFanId(page);
    await page.locator('#fanid-input').fill('Offline_Fan');
    await page.locator('#btn-fanid-continue').click();
    await expect(page.locator('#step-main')).toHaveClass(/active/);
    await expect.poll(() => supabase.events('handle_claim_unavailable').length).toBe(1);
  });

  test('remembers the last username in this browser', async ({ page }) => {
    await buildCard(page, [{ league: 'nhl', team: 'leafs' }], 'Remember_Me');
    await page.locator('#b-restart-flow').click();
    await addTeam(page, { league: 'nba', team: 'raptors' });
    await answerQuiz(page);
    await page.locator('#btn-hub-finish').click();
    await expect(page.locator('#fanid-input')).toHaveValue('Remember_Me');
  });
});
