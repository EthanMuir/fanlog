// Shared steps for driving the card builder.
import { expect } from './fixtures.js';

// Picks `year` in the year-picker sheet opened by clicking `trigger`.
export async function pickYear(page, trigger, year) {
  await page.locator(trigger).click();
  const sheet = page.locator('.year-picker-sheet.visible');
  await expect(sheet).toBeVisible();
  const item = sheet.locator(`.year-picker-item[data-year="${year}"]`);
  await item.click();
  await expect(item).toHaveClass(/selected/);
  await sheet.locator('.year-picker-sheet-done').click();
  await expect(sheet).toBeHidden();
}

// Fills in the builder step for one team and opens its quiz.
export async function addTeam(page, { league, team, since = 2005 }) {
  await expect(page.locator('#step-builder')).toHaveClass(/active/);
  await page.selectOption('#b-sport-select', league);
  await page.selectOption('#b-team-select', team);
  await expect(page.locator('#builder-logo-preview')).toBeVisible();
  await pickYear(page, '#b-since-trigger', since);
  await expect(page.locator('#b-since-display')).toHaveText(String(since));
  await page.locator('#btn-to-quiz').click();
  await expect(page.locator('#step-quiz')).toHaveClass(/active/);
}

// Answers the open quiz. `level` 0..3 picks that option for every multiple
// choice question (trivia included) and scales the slider to match.
export async function answerQuiz(page, { level = 3, prediction = 2030 } = {}) {
  const slider = page.locator('#quiz-questions-list .quiz-slider');
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round((max * level) / 3)));
  for (const q of await page.locator('#quiz-questions-list .quiz-question-item:has(.quiz-options-grid)').all()) {
    await q.locator('.quiz-option-btn').nth(level).click();
  }
  const id = await page.locator('#quiz-questions-list .year-picker-trigger').getAttribute('id');
  await pickYear(page, `#${id}`, prediction);
  await expect(page.locator('#btn-quiz-next')).toBeEnabled();
  await page.locator('#btn-quiz-next').click();
  await expect(page.locator('#step-hub')).toHaveClass(/active/);
}

// Hub → Fan ID → reveal → finished card.
export async function finishCard(page, handle = 'E2E_Fan') {
  await page.locator('#btn-hub-finish').click();
  await expect(page.locator('#step-fanid')).toHaveClass(/active/);
  await page.locator('#fanid-input').fill(handle);
  // Buttons lift 1px on hover; if the pointer is left on the button's edge
  // from the previous click it flickers between hover states and never
  // settles, so move it out of the way first.
  await page.mouse.move(0, 0);
  await page.locator('#btn-fanid-continue').click();
  await expect(page.locator('#step-main')).toHaveClass(/active/);
  await expect(page.locator('#f-card-score')).not.toHaveText('--');
}

export async function buildCard(page, teams, handle) {
  await page.goto('/');
  await page.locator('#btn-start-flow').click();
  for (const [i, t] of teams.entries()) {
    if (i > 0) await page.locator('#btn-hub-add-team').click();
    await addTeam(page, t);
    await answerQuiz(page, t);
  }
  await finishCard(page, handle);
}

// The ?c= encoding the app uses for share links
export function encodeCircle(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCircle(enc) {
  return JSON.parse(Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}
