# Tests

All three suites run in CI (`.github/workflows/ci.yml`) on every pull request.

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit (Vitest) | `npm test` | The archetype engine (every output must be one the share renderers accept), the FanLog Score and card math, share-link payload sanitising, the `/share` and `/api/og` Edge functions (crawler vs. person, escaping, image height parity), the Supabase clients (`circles.js`, `fans.js`, `waitlist.js`), the `waitlist-signup` edge function and the team data |
| Database (Vitest + Postgres) | `npm run test:db` | Every file in `supabase/migrations`, applied in order to a fresh database, then RLS and the `get_circle` / `claim_handle` functions checked as the `anon` and `service_role` API roles |
| End-to-end (Playwright) | `npm run e2e` | The production build in Chromium (desktop and a phone): building a card, the Fan ID step, sharing and downloading, opening shared links (including tampered ones), the waitlist and the landing page |

## End-to-end

`playwright.config.js` builds the site with `VITE_SUPABASE_URL` pointing at a
Supabase project that doesn't exist, then serves it with `vite preview`.
`e2e/fixtures.js` answers every request to that project in the browser (REST,
`get_circle`, `claim_handle`, the waitlist function and analytics events),
records them so tests can check what was sent, and blocks every other outside
host (team logos get a blank image). Nothing touches real data.

```bash
npx playwright install chromium
npm run e2e
```

To rerun without rebuilding, use `E2E_SKIP_BUILD=1 npm run e2e`. Add `--ui` or
`--headed` after `npx playwright test` to watch the browser.

## Database

Needs a Postgres superuser `postgres`/`postgres` on port 5432 (or set
`E2E_DATABASE_URL`). For example:

```bash
docker run -d --name fanlog-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
npm run test:db
```

The tests create and drop a `fanlog_test` database on that server.
