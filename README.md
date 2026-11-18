# DriveHub

A backend-only vehicle rental platform built as four microservices. Customers book and pay for vehicles, rental staff manage the fleet, and every important step produces a notification.

ITS4243 Microservices and Cloud Computing, Assignment 01.

## Architecture

```
            REST                          events (RabbitMQ topic exchange "drivehub.events")
Booking ──────────► Fleet
   │  booking.created / cancelled / returned ──► Payment ──► payment.completed / failed / refunded
   │◄────────────── payment.completed ──────────┘
   └──► every booking.* and payment.* event ──► Notification
```

| Service | Port | Database | Scenario |
|---|---|---|---|
| fleet-service | 3001 | fleetdb | 3. Vendor manages fleet |
| booking-service | 3002 | bookingdb | 1. Book a vehicle, 4. Pickup and return |
| payment-service | 3003 | paymentdb | 2. Online payment and deposit |
| notification-service | 3004 | notificationdb | 5. Booking notifications |
| analytics-service | 3005 | analyticsdb | Business Intelligence, Live Revenue & Fleet Metrics |

Each service owns its database and never reads another service's tables. Services talk by REST (Booking asks Fleet about a vehicle) and by events (everything else).

Stack: Node.js 22, TypeScript, Express 5, PostgreSQL 16, RabbitMQ, Docker Compose.

## Run it

```bash
docker compose up --build
```

The first start takes a minute or two (images and installs). Then open:

- Swagger UI per service: http://localhost:3001/docs, :3002/docs, :3003/docs, :3004/docs, :3005/docs
- RabbitMQ dashboard: http://localhost:15672 (guest / guest)
- Smoke test of the whole flow: `node scripts/e2e.mjs`
- Postman: import `docs/postman/drivehub.postman_collection.json` and run the folders in order

Stop with `Ctrl+C`. Wipe the databases with `docker compose down -v`.

## Business flow

1. `POST /bookings` (booking-service) checks the vehicle with Fleet and blocks overlapping dates, then creates a **PENDING** booking and emits `booking.created`.
2. Payment creates a payment request (rental price + 20% refundable deposit).
3. `POST /payments/{id}/pay` pays it. Card numbers ending in `0000` are declined (demo rule), any other card works. Success emits `payment.completed`.
4. Booking becomes **CONFIRMED**. Pickup is only allowed for confirmed bookings.
5. On return, each late day costs 1.5x the daily rate. Payment returns the deposit minus the late fee.
6. Cancelling a paid booking refunds everything.
7. Notification records a message for each event.

Booking statuses: `PENDING → CONFIRMED → PICKED_UP → RETURNED`, or `CANCELLED` from PENDING or CONFIRMED.

## Working on one service

Run only the infrastructure in Docker, and the service you are editing on your machine with auto-reload:

```bash
docker compose up -d postgres rabbitmq
cd services/fleet-service
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fleetdb PORT=3001 npm run dev
```

Other services need these too: `RABBITMQ_URL=amqp://guest:guest@localhost:5672` (Booking, Payment, Notification) and `FLEET_URL=http://localhost:3001` (Booking). Use the database name for that service: `bookingdb`, `paymentdb`, `notificationdb`.

## Repo layout

```
services/<name>-service/   src/index.ts (routes + startup), src/db.ts, src/events.ts, openapi.yaml, Dockerfile
infra/postgres/init.sql    creates one database per service
docs/                      REPO_SETUP.md (team workflow), Postman collection
scripts/e2e.mjs            end-to-end smoke test
.github/workflows/ci.yml   typecheck + compose check on every push and PR
```

Event reference (routing key → payload fields): `booking.created` {bookingId, customerEmail, totalPrice, deposit}, `booking.confirmed`, `booking.cancelled`, `booking.picked_up` {bookingId, customerEmail}, `booking.returned` {bookingId, customerEmail, deposit, lateFee, lateDays}, `payment.completed` {paymentId, bookingId, customerEmail, amount}, `payment.failed` (+ reason), `payment.refunded` {paymentId, bookingId, customerEmail, refundAmount, reason}.
