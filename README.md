# DriveHub

A microservices-based backend vehicle rental platform built across five services with PostgreSQL 16 and RabbitMQ, orchestrating vehicle fleet management, bookings, payments/deposits, notifications, and analytics.

**Course:** ITS4243 Microservices and Cloud Computing — Assignment 01

## Team

| Member | Role |
| :--- | :--- |
| **Pahasara** | Backend & Microservices Architecture |
| **Avishka** | Frontend Application |
| **Inshaf** | Unit & Integration Testing |

---

## Architecture

Each microservice owns a dedicated PostgreSQL database (`pgdata` volume) and never queries another service's database directly. Services communicate synchronously over **REST** and asynchronously over **RabbitMQ** (topic exchange: `drivehub.events`).

```text
            REST                          Events (RabbitMQ: "drivehub.events")
Booking ──────────► Fleet
   │  booking.created / cancelled / returned ──► Payment ──► payment.completed / failed / refunded
   │◄────────────── payment.completed ──────────┘
   └──► every booking.* and payment.* event ──► Notification & Analytics
                                                    └─► also holds REST URLs for Fleet, Booking, Payment & Notification
```

### Services Overview

| Service | Port | Database | Dependencies & Key Env Vars | Role |
| :--- | :--- | :--- | :--- | :--- |
| `fleet-service` | `3001` | `fleetdb` | `postgres` (`DATABASE_URL`) | Vendor fleet & availability |
| `booking-service` | `3002` | `bookingdb` | `postgres`, `rabbitmq`, `fleet-service` (`FLEET_URL`, `RABBITMQ_URL`) | Bookings, pickup & return |
| `payment-service` | `3003` | `paymentdb` | `postgres`, `rabbitmq` (`RABBITMQ_URL`) | Payments, deposits & refunds |
| `notification-service` | `3004` | `notificationdb` | `postgres`, `rabbitmq` (`RABBITMQ_URL`) | Event notifications |
| `analytics-service` | `3005` | `analyticsdb` | `postgres`, `rabbitmq`, all 4 core services (`FLEET_URL`, `BOOKING_URL`, `PAYMENT_URL`, `NOTIFY_URL`, `RABBITMQ_URL`) | Revenue, fleet & BI metrics |

**Tech Stack:** Node.js 22 · TypeScript · Express 5 · PostgreSQL 16 (`postgres:16-alpine`) · RabbitMQ (`rabbitmq:3-management-alpine`) · Docker Compose

---

## Quick Start

Start the entire backend stack using Docker Compose (the initial build takes 1–2 minutes):

```bash
docker compose up --build
```

Optional `.env` overrides supported by `docker-compose.yml`:
* `POSTGRES_USER` (default: `postgres`), `POSTGRES_PASSWORD` (default: `postgres`)
* `RABBITMQ_USER` (default: `guest`), `RABBITMQ_PASSWORD` (default: `guest`)

* **Stop services:** `Ctrl + C`
* **Reset databases & `pgdata` volume:** `docker compose down -v`

### Useful Endpoints & Tools

* **Swagger API Docs:**
  * Fleet: `http://localhost:3001/docs`
  * Booking: `http://localhost:3002/docs`
  * Payment: `http://localhost:3003/docs`
  * Notification: `http://localhost:3004/docs`
  * Analytics: `http://localhost:3005/docs`
* **RabbitMQ Management UI:** `http://localhost:15672` *(Default credentials: `guest` / `guest`)*
* **Postman Collection:** Import `docs/postman/drivehub.postman_collection.json` and run folders sequentially.

---

## Testing

* **End-to-End Smoke Test:**
  ```bash
  node scripts/e2e.mjs
  ```
* **Unit Tests (per service):**
  ```bash
  node --test tests/unit/<serviceName>.test.mjs
  ```

---

## Business Flow

**Booking Lifecycle:** `PENDING` → `CONFIRMED` → `PICKED_UP` → `RETURNED` *(or `CANCELLED` from Pending/Confirmed)*

1. **Create Booking:** `POST /bookings` checks vehicle availability with `fleet-service`, prevents overlapping dates, creates a `PENDING` booking, and emits `booking.created`.
2. **Generate Payment:** `payment-service` consumes `booking.created` and creates a payment request (`rental price + 20% refundable deposit`).
3. **Process Payment:** `POST /payments/{id}/pay` processes payment. *(Demo rule: card numbers ending in `0000` are declined; any other card succeeds and emits `payment.completed`).*
4. **Confirm & Pickup:** The booking becomes `CONFIRMED`. Vehicle pickup is allowed only for confirmed bookings.
5. **Vehicle Return:** Returns calculate late fees at **1.5x the daily rate** per late day, and `payment-service` refunds the deposit minus the late fee.
6. **Cancellation:** Cancelling a paid booking triggers a full refund.
7. **Notifications & Analytics:** `notification-service` logs customer notifications, and `analytics-service` tracks live business and fleet metrics across events and service endpoints.

---

## Local Development (Single Service)

PostgreSQL (`5432`) and RabbitMQ (`5672` AMQP / `15672` UI) expose host ports so you can run a single service outside Docker with hot-reload:

1. **Start infrastructure:**
   ```bash
   docker compose up -d postgres rabbitmq
   ```

2. **Install dependencies and run the target service:**
   ```bash
   cd services/fleet-service
   npm install
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/fleetdb PORT=3001 npm run dev
   ```

> **Environment Variables for Other Services:**
> * **Database URLs:** Use `bookingdb`, `paymentdb`, `notificationdb`, or `analyticsdb` on `localhost:5432`.
> * **RabbitMQ** *(Booking, Payment, Notification, Analytics)*: `RABBITMQ_URL=amqp://guest:guest@localhost:5672`
> * **Service URLs** *(when running locally)*: `FLEET_URL=http://localhost:3001` (Booking & Analytics), plus `BOOKING_URL=http://localhost:3002`, `PAYMENT_URL=http://localhost:3003`, and `NOTIFY_URL=http://localhost:3004` for Analytics.

---

## Repository Structure

```text
├── services/
│   └── <name>-service/
│       ├── src/
│       │   ├── index.ts        # Express routes & server startup
│       │   ├── db.ts           # PostgreSQL connection & queries
│       │   └── events.ts       # RabbitMQ publishers & consumers
│       ├── openapi.yaml        # Swagger API specification
│       └── Dockerfile
├── infra/
│   └── postgres/init.sql       # Initializes isolated databases per service
├── docs/
│   └── postman/                # Postman API collection
├── scripts/
│   └── e2e.mjs                 # End-to-end smoke test script
├── tests/
│   └── unit/                   # Service unit tests
└── .github/workflows/ci.yml    # CI pipeline (typecheck & Docker Compose validation)
```

---

## Event Reference

| Routing Key | Payload Fields |
| :--- | :--- |
| `booking.created` | `{ bookingId, customerEmail, totalPrice, deposit }` |
| `booking.confirmed` | `{ bookingId }` |
| `booking.cancelled` | `{ bookingId }` |
| `booking.picked_up` | `{ bookingId, customerEmail }` |
| `booking.returned` | `{ bookingId, customerEmail, deposit, lateFee, lateDays }` |
| `payment.completed` | `{ paymentId, bookingId, customerEmail, amount }` |
| `payment.failed` | `{ paymentId, bookingId, customerEmail, amount, reason }` |
| `payment.refunded` | `{ paymentId, bookingId, customerEmail, refundAmount, reason }` |
