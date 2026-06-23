# Codex Guide

## Project Snapshot

This is a small NestJS REST API for an in-memory inventory reservation coding
challenge. It prevents overselling during high-concurrency reservation attempts.
State intentionally lives inside the Node.js process using `Map` structures; app
restart clears inventory, reservations, locks, and timers.

Read this file first for agent context. Use `README.md` only when you need API
examples, Docker usage details, or challenge-facing explanation.

## Core Invariants

- Available stock is `totalStock - confirmedSales - activeReservations`.
- One reservation holds exactly one unit.
- Confirmed reservations are final and cannot be cancelled.
- Cancelled and expired reservations release their held unit.
- Active reservations expire after exactly 2 minutes.
- Same-item mutations must be protected by the per-item lock to avoid
  overselling.

## Architecture Map

- `src/inventory/`: owns item creation/reset and raw item stock.
- `src/reservations/`: owns reservation lifecycle, expiry, inventory snapshots,
  and stock calculations.
- `src/locking/`: provides one async mutex per item ID.
- `src/common/clock.ts`: wraps time/timers so expiry behavior is testable.
- `test/app.e2e-spec.ts`: REST-level behavior checks.
- `src/reservations/reservations.service.spec.ts`: lifecycle, expiry, and
  concurrency rule checks.

## Commands

Local Node:

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

Docker Compose:

```bash
docker compose up -d
docker compose run --rm api npm test
docker compose run --rm api npm run test:e2e
```

## Editing Guidance

- Follow the existing NestJS module/service/controller layout.
- Keep persistence in memory unless the user explicitly asks for a database,
  Redis, queue, or file storage.
- Do not add auth, payment flow, frontend, or external services by default.
- Preserve per-item locking around operations that mutate or inspect same-item
  reservation state.
- Keep business rules explicit in services; avoid hiding reservation lifecycle
  behavior behind broad abstractions.
- Treat `README.md` as user-facing documentation and avoid duplicating it here.

## Testing Guidance

- Add or update service specs for reservation lifecycle, expiry, stock math, and
  concurrency rules.
- Add or update e2e specs for REST endpoints and response behavior.
- Use the existing fake clock pattern for expiry tests instead of real-time
  sleeps.
- For concurrency changes, keep coverage that proves only one reservation
  succeeds when many users race for one unit of stock.

## Token-Saving Workflow

1. Read `AGENTS.md`.
2. Inspect only the modules and tests touched by the requested change.
3. Use `README.md` for public API examples or challenge background.
4. Prefer narrow edits and targeted tests over broad refactors.
