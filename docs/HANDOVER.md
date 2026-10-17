# Handover: The Padel Series, Survivor

## What you have
| | |
|---|---|
| App | https://padel-survivor.web.app (installable PWA) |
| Repository | github.com/samjuice/Survivor-Series (**public**, so no secrets are ever committed) |
| Hosting | Firebase Hosting, project `padel-survivor` |
| Database and auth | Supabase project `ypwjoomizjxadrwifzrt` (Frankfurt), Postgres + RLS + Auth + Realtime |
| Stack | Vite, React, TypeScript, Tailwind, react-query, supabase-js (PKCE), vite-plugin-pwa |
| Not touched | Your existing league app (zenzele-rands-v2, cpzfwzmmsgulyciercqz): no shared database, auth, secrets or hosting. Scripts refuse to run against its project id. |

## How auto-deploy works
Every push to `main` runs `.github/workflows/deploy.yml`, in this order. A failure at any step stops everything after it:
1. install, typecheck, lint, UI tests
2. database tests on a throwaway Postgres
3. apply any new migration in `supabase/migrations/` to Supabase (each runs once, in its own transaction)
4. verify the live database (RLS on every table, no extra privileges, every function present, auth columns present)
5. live anonymous-API check: a visitor with no login must be refused everywhere it should be
6. live end-to-end check: real sign-in with throwaway users, then it deletes everything it created (non-blocking, it reports as an annotation)
7. production build, then deploy to Firebase Hosting

GitHub settings it needs (already set): secret `FIREBASE_TOKEN`, secret `SUPABASE_DB_URL` (session-pooler string for the **new** project only).
To add a database change: add the next numbered file in `supabase/migrations/`, add tests in `supabase/tests/`, push. Run the database tests locally with `scripts/test-db.sh` (needs a local Postgres).

## What is implemented
**Stage 1:** sign-up, sign-in, resend confirmation, password reset, complete-profile; roles (player, captain, admin, platform owner); registration with capacity and approval; manual payment confirmation; paid placeholders and linking them later; tribes; round-robin fixtures; results with validation and admin approval; standings with ties shown; announcements and a live feed; prize pool with override; admin dashboard; PWA.

**Stage 2:** opening Americano (generator, preview, score entry, standings); random tribe assignment with preview and remainder explanation; random or manual captains; tribe reveal screen (live, in reveal order); Tribal Warfare line-ups (captains pick two representatives) with locking; appearance tracking; fixture regeneration that never touches played matches or approved scores.

**Stage 3:** closing mixed-tribe Americano; awards with secret-ballot voting and anonymous totals (never change points); champions on Home; audit log (who changed what, bank details never stored); CSV exports; in-app notification preferences; user management (suspend, safe delete) and admin assignment.

## Deviations from the brief (please read)
- **Privileged actions are database functions, not Edge Functions.** Deploying Edge Functions needs an account-wide Supabase access token, which I chose not to ask for. Instead, deleting users, suspending users and assigning roles are `SECURITY DEFINER` database functions that check the caller's role on the server. No service key is ever in the browser. Equivalent security, and they are tested in SQL.
- **The repo is `Survivor-Series` and is public** (the empty private repo named in the brief wasn't accessible to the token). Nothing sensitive is in it: the Supabase URL and publishable key are public by design.
- **Push notifications are not built** (the brief said only if fully built and tested). Notification preferences control in-app pop-ups while the app is open. No email or push is sent.

## What is not verified or not built
- **Screens were never viewed on a real phone or browser by me.** Layout, animation and the install-to-home-screen flow are untested. Contrast was measured (all text pairs meet 4.5:1) and component behaviour is tested, but looks need your eyes.
- **Real email delivery** (confirmation and reset emails through your Gmail SMTP) was not tested by me. It depends on your Supabase SMTP and URL settings.
- A **suspended player's existing session** can still read data for up to about an hour (until the token refreshes), although they cannot sign back in. Several actions also check the account is active; plain reads do not.
- The Americano schedule generator is a fair heuristic (tested: no double bookings, even byes, low repeat partners, tribe mixing), not a mathematically optimal design. Americano scores are entered by an admin only.
- Regenerated fixtures place new pairings in the earliest free round, which can use more rounds than a fresh draw.
- No bulk import of players, no per-player email invites, no in-app payment gateway (by design).
- GitHub shows a "Node 20 actions" deprecation notice. It is cosmetic.

## Tests actually run (latest green deploy)
| Check | Result |
|---|---|
| Database tests (RLS, scoring rules, capacity, results flow, walkovers, withdrawals, fixtures, regeneration, Americano, awards, audit, user management, deletion) | **357 passed, 0 failed** |
| UI tests (score rules for all 64 set scores, sign-in traps, score form, tribe assignment, Americano entry, generator, CSV safety) | **41 passed, 0 failed** |
| Live check: anonymous visitor refused (tables and functions) | **35 passed, 0 failed** |
| Live end-to-end with real tokens (player cannot self-approve, pay, create competitions, call admin functions, or read others' data; scoring rules; standings; feed; audit; privacy), then cleanup | **44 passed, 0 failed, 0 rows left behind** |
| Live structure check | 21 tables, none without RLS, 29/29 functions, auth columns present, API roles hold no extra privileges |
| Typecheck, lint, production build | clean |

Bugs found by these tests and fixed along the way: a regeneration logged one audit line per match; suspensions were invisible to the competition's admins; deleting a competition with tribes failed (audit foreign key and cascade ordering).

## Security notes
- Rotate or revoke: the GitHub personal access token that was pasted into the build chat, and (when convenient) the Firebase CI token.
- The database password lives only in the GitHub secret `SUPABASE_DB_URL`.
- Never put the Supabase `service_role` key in the repo or the app.
