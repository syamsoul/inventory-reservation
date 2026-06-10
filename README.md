# Inventory Reservation System

Everest Engineering backend coding challenge solution: a lightweight NestJS REST API that prevents overselling in a high-concurrency flash-sale scenario.

The app intentionally keeps inventory **in memory**. Inventory items, reservations, and per-item locks live inside the running Node.js process using `Map` data structures. Restarting the app clears all state. There is no database, Redis, queue, or file persistence because the challenge focuses on reservation correctness, lifecycle handling, and concurrency control.

## Features

- Basic in-memory inventory reservation.
- Reservation lifecycle: `ACTIVE`, `CONFIRMED`, `CANCELLED`, `EXPIRED`.
- Two-minute reservation hold time.
- Automatic expiry plus defensive expiry checks before reads/mutations.
- Per-item mutex to prevent race conditions.
- Concurrency test proving 1 success and 499 failures for 500 simultaneous requests against stock of 1.

## Business Rules

```text
Available Stock = Total Stock - Confirmed Sales - Active Reservations
```

- Each reservation holds one unit.
- Reservations exceeding available stock fail.
- Confirmed purchases cannot be reversed.
- Cancelled and expired reservations release inventory.
- Only one user can reserve the last available item.

## Run With Docker Compose

Build and start the API:

```bash
docker compose up -d
```

The API runs at:

```text
http://localhost:3000
```

Run all tests:

```bash
docker compose run --rm api npm test
```

Run e2e tests:

```bash
docker compose run --rm api npm run test:e2e
```

## Optional Local Node Commands

If Node.js is installed locally:

```bash
npm install
npm test
npm run start:dev
```

## API

Create or reset an item:

```bash
curl -X POST http://localhost:3000/inventory/items \
  -H 'Content-Type: application/json' \
  -d '{"itemId":"sku-1","totalStock":1}'
```

Inspect inventory:

```bash
curl http://localhost:3000/inventory/items/sku-1
```

List all inventory snapshots:

```bash
curl http://localhost:3000/inventory/items
```

Create reservation:

```bash
curl -X POST http://localhost:3000/reservations \
  -H 'Content-Type: application/json' \
  -d '{"itemId":"sku-1","userId":"user-1"}'
```

Confirm reservation:

```bash
curl -X POST http://localhost:3000/reservations/<reservationId>/confirm
```

Cancel reservation:

```bash
curl -X POST http://localhost:3000/reservations/<reservationId>/cancel
```

Get reservation:

```bash
curl http://localhost:3000/reservations/<reservationId>
```

List all reservations:

```bash
curl http://localhost:3000/reservations
```

Manual race-condition check:

```bash
curl -X POST http://localhost:3000/inventory/items \
  -H 'Content-Type: application/json' \
  -d '{"itemId":"sku-1","totalStock":1}'

seq 1 50 | xargs -P50 -I{} curl -s -o /tmp/reservation-{}.json -w "%{http_code}\n"   -X POST http://localhost:3000/reservations   -H 'Content-Type: application/json'   -d "{\"itemId\":\"sku-1\",\"userId\":\"user-{}\"}" | sort | uniq -c
```

Expected result:

```text
1 201
49 409
```

## Locking Strategy

The app uses one async mutex per inventory item. All mutations for the same item are serialized:

- reserve
- confirm
- cancel
- expire

Requests for different items can proceed independently. This keeps the concurrency control small and explicit while preventing overselling for the same item.

## Assumptions

- One reservation reserves one unit.
- Hold time is exactly two minutes.
- Confirmed purchases cannot be cancelled.
- In-memory state is acceptable and intentional for this challenge.
- No authentication, payment flow, frontend, database, Redis, or message queue is required.

## AI Usage Disclosure

AI assistance was used for planning, implementation scaffolding, and review. The architecture, tradeoffs, tests, and final behavior were reviewed and validated by me before submission.
