# Time Planner V3 Agent Rules

- Stack: Next.js 16 App Router, React 19, TypeScript, SQLite/better-sqlite3.
- Read the relevant local Next.js 16 guide under `node_modules/next/dist/docs/` before changing framework behavior.
- All date keys use `YYYY-MM-DD` in `Asia/Shanghai`; timestamps use Unix milliseconds.
- Preserve one task record across today/week/month/project views. Do not create task view copies.
- Every new table and query is tenant-scoped by `user_id`. Validate related task/project/habit ownership.
- Never read, copy, log, commit, or export `.env`, production databases, passwords, sessions, API tokens, or private keys.
- Database migrations must be idempotent and preserve existing data. Keep `src/db/schema.ts` and `src/db/migrations.ts` aligned.
- AI output is advisory and untrusted: validate IDs, time ranges, overlap, capacity, and ownership before persistence. Provide a deterministic fallback.
- Do not add background schedulers in this release. Carryover and reminders use explicit APIs; Hermes may poll read-only endpoints.
- You are not alone in the codebase. Do not revert other agents' edits; adapt to concurrent changes.
- Shared files are owned by the root agent unless explicitly reassigned: database schema/migrations, package files, global layout/navigation, shared task types/store integration.
- Verification order: tests, `npx tsc --noEmit --incremental false`, then `npx next build --webpack`.

