# REBOOT 2026

A four-game team event site for AI/ML, SysCom, GameDev, and WebDev. CyberSec is not part of this edition. The Next.js app serves the public pages, enrollment and member access, a leaderboard, and an operator console at `/admin`. Server routes own validation, signed sessions, login throttling, team state, and scoring; the browser does not connect to the database.

## Run locally

Use Node.js 20 or newer (Node 22 is used in CI). In PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set local values in `.env.local` as needed. Without `DATABASE_URL`, local development uses `data/event.json`; the file is ignored by Git and must be backed up separately if it contains valuable event data. If you set `DATABASE_URL`, the app uses PostgreSQL and you must first run `npm run db:migrate` against that database. Do not commit `.env.local` or a connection URL.

| Variable | Behavior |
| --- | --- |
| `DATABASE_URL` | Server-only pooled PostgreSQL transaction URL; use provider-required TLS such as `sslmode=require`. Required on Vercel. The database client already uses `prepare: false` for transaction pooling. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Both are required for admin sign-in outside development. When either is absent in `NODE_ENV=development`, the local fallback is exactly `admin` / `admin`. There is no production fallback. Changing either configured credential revokes existing admin sessions. |
| `SESSION_SECRET` | Long random secret for signed member and admin cookies and shared login throttling. Required in production. Development has a fixed local-only fallback. |
| `SCORE_CODE_KEY` | Required for score-code redemption in production and deployment environments. Use the numeric key configured in the external game's encoder; a missing or invalid value returns 503. Local development defaults to `98765` only when unset. This arithmetic code is not cryptographic protection. |
| `ALLOWED_EMAIL_DOMAINS` | Optional comma-separated exact domains, such as `college.edu,university.ac.in`. Empty uses the built-in `.edu`, `.ac`, and country `.ac.*` academic-domain rule. Enrollment does not verify mailbox ownership. |
| `ALLOW_JSON_STORAGE` | Leave unset on Vercel. `true` explicitly allows JSON storage on a single persistent production Node host; it cannot make serverless files durable or coordinate instances. Production without a database or this explicit override returns 503 for stateful operations. |
| `TRUSTED_CLIENT_IP_HEADER` | For a non-Vercel production proxy, set this to a client-IP header that the proxy overwrites on every request. Vercel automatically uses its trusted `x-vercel-forwarded-for` header; leave this unset there. |

## Commands

```powershell
npm run dev         # local development server
npm run db:migrate  # apply pending PostgreSQL migrations to DATABASE_URL
npm test            # Node test suite
npm run lint        # ESLint
npm run build       # production build
npm run check       # test, lint, build
npm run start       # serve a production build on a persistent Node host
```

The production build does not require a database connection or real secrets because it does not execute application requests. Runtime requests do require the production configuration above.

## Event flow

At `/enroll`, one captain enrolls one to four members. The first member is captain. Each member needs a name and unique college email. The enrollment response shows one private access code per member once; save and distribute the codes privately. The captain is signed in immediately. Other members sign in at `/join` with their email and code. An enrollment key makes retrying the same submission idempotent.

The operator console's Overview / Teams section shows rosters and score history. An operator can reset a member code there: the old code and existing member sessions stop working, and the replacement is shown once. Save it before dismissing the reveal. The stored code is a hash, not the readable value.

Score entry records attempts for a member and one of the four games. Valid scores range from 0 to 1,000,000. Each team's best score for a game is the maximum attempt by any member; its total is the sum of the four game bests. Lower attempts remain in history and do not reduce the best. The public leaderboard shows aggregate scores, while the admin console shows individual attempts.

For a Live game, a signed-in member can POST `{ "gameId": "aiml", "code": "..." }` to `/api/member/scores`. The server decodes the six-character code using `SCORE_CODE_KEY` and records the score for that member. Each distinct score per member and game is kept as an attempt; replaying the same score does not add a second record. The endpoint limits each member to 12 submissions per 15 minutes, including valid submissions, and returns `Retry-After` when limited. The operator's manual score entry remains available regardless of game status. The current six-character format with key `98765` can represent scores only through 5,713, even though the general score policy allows up to 1,000,000. The arithmetic code can be forged by anyone who knows its algorithm and key; it is an event compatibility mechanism, not proof of a game result.

Under Games, the operator can set each game to Coming soon, Live, or Closed and optionally set an HTTP or HTTPS launch URL. A member can open the external game only when it is Live and has a URL. In the player area, each Live game also has a score-code form, even without a launch URL. Each member submits their own game-issued code; a successful submission updates the team's displayed best and total immediately. The operator can still enter scores manually. Keep launch destinations under organizer control.

## Storage and deployment

The local JSON store writes `data/event.json` through a temporary-file rename in one process. PostgreSQL is the durable shared store for production, including Vercel serverless functions. Its schema is applied with `npm run db:migrate`; the app does not automatically migrate on request. Back up local JSON before moving existing data: the migrations create an empty database and do not import that file. Arrange database backups and test restore procedures with your provider.

For a first deployment, create a PostgreSQL database (Supabase, Neon, or Vercel Marketplace are options), use its pooled transaction URL, configure the Vercel environment variables, run migrations against that same database, then import the GitHub repository into Vercel. GitHub plus Vercel alone is insufficient until the database, migrations, and environment variables are configured. Keep preview and production on separate databases, and never point untrusted preview deployments at the production database. Place the database region close to the Vercel functions to reduce latency.

See [the deployment checklist](docs/deployment.md) for exact steps and verification. Do not commit `.env.local`, a database URL, access codes, or event data.
