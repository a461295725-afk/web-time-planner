# Time Planner V3 Implementation Plan

## Ownership

- Root agent: shared schema/migrations, shared task types/store/API integration, global layout/navigation, integration review, test harness, deployment and rollback.
- V3.1 agent: capture/search/inbox stores, APIs, pages and command palette.
- V3.2 agent: smart-day/focus/feedback stores, APIs, pages and Hermes summary.
- V3.3 agent: reviews/carryover/stats/stalled/memory/export stores, APIs and pages.

## Ordered work

1. Root: baseline verification and idempotent V3 database contract.
2. V3.1/V3.2/V3.3: implement independent feature files in parallel against the frozen contract.
3. Root: connect global command palette/navigation and task fields to existing UI/API.
4. Root: add migration, auth/isolation, deterministic planning, idempotency and export-safety tests.
5. Root: run tests, typecheck, production build and diff review; agents fix findings within ownership.
6. Root: copy code-only release to VPS staging directory, use a database copy, test temporary port.
7. Root: back up production database and source, deploy release, run migrations, smoke test, retain rollback package.

## Required verification

```text
npm test
npx tsc --noEmit --incremental false
npx next build --webpack
git diff --check
```
