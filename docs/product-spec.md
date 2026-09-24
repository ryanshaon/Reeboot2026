# Enigma REBOOT 2026 Product Specification

## Event model

REBOOT 2026 is a four-game team event. The games are AI/ML, SysCom,
GameDev, and WebDev. CyberSec is not part of this edition.

## Enrollment

- One captain enrolls a team through the website.
- A team has one to four members.
- Every member requires a name and college email.
- Email values are normalized and must be unique across the event.
- The first member is the captain.
- Enrollment returns one private access code per member. The captain distributes
  those codes to the corresponding teammates.
- The captain is signed in immediately after enrollment.
- Other members sign in using their registered college email and personal code.

Until email delivery is configured, supplying a college email records the
identity but does not prove ownership. An optional `ALLOWED_EMAIL_DOMAINS`
environment variable can restrict enrollment to organizer-approved domains.

## Playing and scoring

- Signed-in members see the same four-game team hub.
- Game buttons remain disabled and say "Coming soon" while URLs are unset.
- When configured, a game URL opens for the signed-in member.
- Admins may record multiple score attempts per member and game.
- A team's score for a game is the highest score achieved by any team member.
- A team's leaderboard total is the sum of its four game-best scores.
- All attempts are retained for audit.

## Administration

- Admin credentials are server-side environment variables.
- Successful admin login creates a signed HttpOnly cookie.
- Admins can inspect all teams, member emails, game bests, and attempts.
- Admins can record attempts, configure game URLs/status, and reset a member's
  access code.
- The public leaderboard never exposes emails or access credentials.

## Storage

Local development uses an atomic, serialized JSON store under `data/`, behind a
storage module. This is intentionally credential-free for immediate use.
Production deployment must replace it with durable Postgres, Supabase, or
Firestore storage because serverless filesystems are ephemeral.

## Visual direction

Use the approved Enigma monochrome cyber-editorial direction: off-black canvas,
bone-white type, condensed display headlines, monospace operational labels,
technical grid/grain, sharp borders, and responsive data layouts.
