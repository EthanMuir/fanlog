// Pure, DOM-free math/data shared by the two card renderers: main.js draws
// the Loyalty Card as real DOM/SVG in the browser, api/og.js draws the same
// design as a satori element tree in a Vercel Edge Function (no `document`,
// no CSSOM, no client-side JS at all there) for the share-link thumbnail.
// Neither renderer can run the other's drawing code, but the color/geometry/
// label *decisions* behind the drawing don't depend on either one — keeping
// those here means the two pictures can't quietly drift apart the way the
// rainbow-gauge geometry and prediction-label logic already had.

// Concentric rainbow gauge geometry (initializeRainbowSVG/updateRainbowSVG in
// main.js): four half-circle tracks sharing one center, outermost first.
export const RAINBOW_RADII = [130, 108, 86, 64];
export const RAINBOW_CX = 150;
export const RAINBOW_CY = 160;

export function getLuminance(hex) {
  if (!hex) return 0;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Picks whichever of a team's two colors reads against the card's dark
// background (falls back to the primary color when neither is dark).
export function getContrastAdaptedColor(primaryHex, secondaryHex) {
  const brightness = getLuminance(primaryHex);
  if (brightness < 45 && secondaryHex && getLuminance(secondaryHex) > brightness) return secondaryHex;
  return primaryHex;
}

// The share-link OG image (api/og.js) fits its canvas height to content
// (1-4 team bars, 1-3 archetype lines) instead of a fixed size, so the
// og:image:height meta tag api/share.js prints for crawlers has to predict
// the same number without actually rendering the image. Keeping the formula
// here means the two can't drift apart the way separately-hand-copied
// layout constants would.
export function estimateOgImageHeight(archetype, teamCount) {
  const barRows = Math.min(teamCount, 4);
  const chartHeight = barRows ? 42 + (barRows - 1) * 62 : 0;
  const heroHeight = Math.max(160, chartHeight);
  const archetypeLines = Math.max(1, Math.min(3, Math.ceil((archetype || '').length / 45)));
  const archetypeHeight = archetypeLines * 43;
  const contentHeight = 40 + 24 + heroHeight + 32 + archetypeHeight + 14 + 28;
  return Math.max(420, Math.min(630, contentHeight + 96));
}

export function getPredictionLabel(league, teamShort) {
  const prefix = teamShort ? `${teamShort} ` : "";
  if (!league) return `${prefix}PREDICTION`;
  switch (league.toLowerCase()) {
    case "nhl": return `${prefix}CUP PREDICTION`;
    case "nfl": return `${prefix}BOWL PREDICTION`;
    case "nba": return `${prefix}TITLE PREDICTION`;
    case "mlb": return `${prefix}SERIES PREDICTION`;
    case "mls": return `${prefix}CUP PREDICTION`;
    default: return `${prefix}PREDICTION`;
  }
}
