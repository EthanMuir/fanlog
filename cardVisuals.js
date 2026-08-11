// Pure, DOM-free math/data shared by the two card renderers: main.js draws
// the Loyalty Card as real DOM/SVG in the browser, api/og.js draws the same
// design as a satori element tree in a Vercel Edge Function (no `document`,
// no CSSOM, no client-side JS at all there) for the share-link thumbnail.
// Neither renderer can run the other's drawing code, but the color/geometry/
// label *decisions* behind the drawing don't depend on either one — keeping
// those here means the two pictures can't quietly drift apart the way the
// rainbow-gauge geometry and prediction-label logic already had.

// Concentric rainbow gauge geometry (initializeRainbowSVG/updateRainbowSVG in
// main.js, rainbowGauge in api/og.js): four half-circle tracks sharing one
// center, outermost first.
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
