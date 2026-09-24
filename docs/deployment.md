# First deployment: GitHub to Vercel

This checklist is for a new event database. GitHub and Vercel do not provide durable event storage by themselves: configure PostgreSQL, run migrations, and set runtime secrets before accepting traffic.

1. Create PostgreSQL with Supabase, Neon, or a Vercel Marketplace integration. Choose a database region near the Vercel function region. Enable provider backups and record how to restore. Create separate databases for Production and Preview; do not run untrusted previews against the production database. Copy the provider's **pooled transaction** connection URL into a private password manager. Use its required TLS settings (commonly `sslmode=require`). The app's PostgreSQL client sets `prepare: false`, as required by many transaction poolers.

2. Generate independent admin and session secrets locally. PowerShell example (run twice, saving each output privately):

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   Choose a private `ADMIN_USERNAME`. Use one generated value for `ADMIN_PASSWORD` and another for `SESSION_SECRET`. Configure a numeric `SCORE_CODE_KEY` that exactly matches the external game's encoder; it is required for score-code redemption in deployed environments. The six-character arithmetic code is forgeable if its algorithm and key are known, so the key is a compatibility setting rather than cryptographic proof of a score. Never put secrets or a database URL in GitHub, documentation, screenshots, or command history. `ALLOWED_EMAIL_DOMAINS` is optional; decide whether the default academic-domain rule fits the event.

3. Prepare these values for Vercel: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `SCORE_CODE_KEY` for **Production**. Add `ALLOWED_EMAIL_DOMAINS` if using exact domain restrictions. If enabling Preview, prepare the same names for the **Preview** scope with its own database and secrets; its score-code key must match the game encoder used there. Enter them during project import before the first deploy, or in Project Settings → Environment Variables before exposing the deployment. Leave `ALLOW_JSON_STORAGE` and `TRUSTED_CLIENT_IP_HEADER` unset on Vercel. Vercel automatically supplies trusted `x-vercel-forwarded-for` for login throttling. For another production host, set `TRUSTED_CLIENT_IP_HEADER` only when its reverse proxy overwrites that header on every request; otherwise clients could forge it.

4. Verify the source locally with Node.js 20 or newer. CI uses Node 22. A build needs no live database or real secrets because it does not execute requests.

   ```powershell
   npm ci
   npm test
   npm run lint
   npm run build
   ```

5. Run migrations **once per database before sending traffic to it**. For each intended database, copy the example to a local ignored file, enter that database's pooled `DATABASE_URL`, and run the migration. Check the target database before each run. The migration command loads `.env.local`; it is safe to rerun because applied migrations are recorded. Do not commit the file or connection URL.

   ```powershell
   Copy-Item .env.example .env.local
   # Edit .env.local privately and set DATABASE_URL for the intended database.
   npm run db:migrate
   ```

   Repeat with the separate Preview URL if enabling previews. `vercel env pull .env.local` is an optional convenience only when the Vercel CLI is installed and the selected environment is correct; inspect the target environment before running migrations. Do not rely on migrations running automatically during deployment.

6. Create a private GitHub repository, review the files selected for upload, and push the project source. `.gitignore` excludes `.env.local`, event JSON, temporary files, dependencies, and build output. Do not add those files with `git add -f`. In Vercel, choose **Add New Project → Import Git Repository**, select the repository, enter the prepared environment variables for their intended scopes, use the Next.js defaults, and deploy after migrations succeed. Vercel Git integration handles later deployments; no deployment token or CI deploy action is needed.

7. On the deployed URL, check `/`, `/enroll`, `/join`, and `/admin`. Enroll a disposable team, save its one-time member codes, sign in as a non-captain member, and verify the team appears in the admin roster. Enter a manual test score and verify the team best and public leaderboard. Configure a test game URL, set it Live, open it as a member, and redeem a score code emitted by the matching game encoder through `/api/member/scores`. Replay that code and verify only one attempt is recorded. Reset a disposable member code and verify the old code no longer signs in. Remove or clearly identify test records before the real event. A working static page alone does not prove database configuration; stateful requests without `DATABASE_URL` fail with 503, and score redemption without `SCORE_CODE_KEY` fails with 503.

For rollback, redeploy the last known good Vercel deployment, but treat database changes separately: restore from a provider backup or apply a reviewed corrective migration. Do not assume reverting code reverses a migration or resurrects deleted event data. Before a risky schema change, take a database backup and verify that it can be restored. Manual operator score entry remains available if game code redemption is unavailable.
