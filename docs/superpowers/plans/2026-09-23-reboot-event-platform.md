# REBOOT 2026 Event Platform Implementation Plan

**Goal:** Build a complete four-game REBOOT 2026 enrollment, member hub,
leaderboard, and protected admin application in the EnigmaReeboot2026 folder.

**Architecture:** Next.js App Router with server route handlers. A focused
storage adapter writes an atomic local JSON file; authentication uses
HMAC-signed HttpOnly cookies, member access codes are scrypt-hashed, and only
admin routes write scores. Public pages consume API projections that exclude
private member data.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, Node.js crypto/fs, Node
built-in test runner.

**Spec:** `docs/product-spec.md`

## Global constraints

- Team size is 1-4 members.
- The first member is captain; every member has a unique name, email, and access code.
- Games are exactly `aiml`, `syscom`, `gamedev`, and `webdev`.
- Team game score equals the maximum attempt across members; total is the sum of
  four game maxima.
- Game URLs are nullable until organizers configure them.
- Admin credentials and sessions remain server-side.
- Public responses never include member emails, access-code hashes, or admin data.
- Local JSON storage is for local/single-server use, not serverless production.
- Visual style follows the monochrome Enigma REBOOT reference system.

## Task 1: Server foundation, storage, security, and APIs

- [x] Create the package/config scaffold and local data store.
- [x] Test team-size/email validation, sessions, storage, throttling, and scoring.
- [x] Implement enrollment, member sessions, games, and leaderboard APIs.
- [x] Implement protected admin sessions, teams, attempts, settings, and code reset.
- [x] Run the complete backend test suite.

## Task 2: Public enrollment, member game hub, and leaderboard

- [ ] Build the shared monochrome shell, responsive header, technical background,
  focus states, reduced-motion behavior, and footer.
- [ ] Build the 1-4 member enrollment form and one-time access-code receipt.
- [ ] Build member sign-in and the authenticated four-game hub.
- [ ] Build the public leaderboard with game-best columns and total ranking.
- [ ] Verify keyboard navigation and responsive layouts.

## Task 3: Admin control room, documentation, and verification

- [ ] Build the authenticated admin login/session flow.
- [ ] Build team search, roster, score, and attempt inspection.
- [ ] Build score entry, game URL/status configuration, and access-code reset.
- [ ] Document setup, environment variables, storage limits, and future game integration.
- [ ] Run tests, lint, build, and browser verification for every route.
