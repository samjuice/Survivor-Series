# The Padel Series: Survivor

A Survivor-style padel competition platform: tribes, tactics, an Americano opening and finale, live tables and results, awards.

- **Live app:** https://padel-survivor.web.app
- **Running the competition:** [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)
- **Setup, deploy, tests and what's outstanding:** [docs/HANDOVER.md](docs/HANDOVER.md)

Stack: Vite, React, TypeScript, Tailwind, Supabase (Postgres, RLS, Auth, Realtime), Firebase Hosting, GitHub Actions.
Database changes live in `supabase/migrations/` and are applied automatically on deploy.
