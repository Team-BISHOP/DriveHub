# DriveHub

DriveHub is a vehicle rental management platform built with a microservices backend and a React web application. It covers the full rental workflow from listing vehicles and checking availability to processing bookings, deposits, pickups, returns, late fees, and live analytics.

The system is split into five independent Node.js services backed by isolated PostgreSQL databases and connected through REST APIs and RabbitMQ events. Customers can browse vehicles, make reservations, and pay invoices, while fleet staff can manage inventory, handle counter pickups and returns, and monitor system events and revenue.

**Course:** ITS4243 Microservices and Cloud Computing - Assignment 01

## Team

| Member | Role |
| :--- | :--- |
| **Pahasara** | Backend & Microservices Architecture |
| **Avishka** | Frontend Application |
| **Inshaf** | Unit & Integration Testing |

---

## Architecture

Each microservice owns an isolated PostgreSQL database (persisted in the `pgdata` Docker volume) and never queries another service's database directly. Services communicate synchronously over REST and asynchronously over RabbitMQ using the `drivehub.events` topic exchange. Uploaded vehicle images in `fleet-service` are persisted in the `fleet_uploads` Docker volume.

```text
            REST                          Events (RabbitMQ: "drivehub.events")
Booking ----------> Fleet
   |  booking.created / cancelled / returned --> Payment --> payment.completed / failed / refunded
   |<-------------- payment.completed ----------|
   +--> every booking.* and payment.* event --> Notification & Analytics
                                                    +--> also queries Fleet, Booking, Payment & Notification over REST
```

### Services Overview

| Service | Port | Database | Dependencies & Key Env Vars | Role |
| :--- | :--- | :--- | :--- | :--- |
| `fleet-service` | `3001` | `fleetdb` | `postgres` (`DATABASE_URL`) | Fleet CRUD, vehicle images (`/uploads`), status updates |
| `booking-service` | `3002` | `bookingdb` | `postgres`, `rabbitmq`, `fleet-service` (`FLEET_URL`, `RABBITMQ_URL`) | Bookings, overlap checks, pickup & return |
| `payment-service` | `3003` | `paymentdb` | `postgres`, `rabbitmq` (`RABBITMQ_URL`) | Payments, 20% deposits & refunds |
| `notification-service` | `3004` | `notificationdb` | `postgres`, `rabbitmq` (`RABBITMQ_URL`) | Event notification log |
| `analytics-service` | `3005` | `analyticsdb` | `postgres`, `rabbitmq`, all 4 core services (`FLEET_URL`, `BOOKING_URL`, `PAYMENT_URL`, `NOTIFY_URL`, `RABBITMQ_URL`) | Revenue, fleet & event metrics |
| `frontend` | `5173` | - | Vite dev proxy (`/api/*` -> services `3001` to `3005`) | Web UI for customers, counter desk & analytics |

### Tech Stack

* **Backend:** Node.js 22, TypeScript, Express 5, Zod, Multer, Swagger UI
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
* **Data & Messaging:** PostgreSQL 16 (`postgres:16-alpine`), RabbitMQ (`rabbitmq:3-management-alpine`)
* **Infrastructure:** Docker Compose, GitHub Actions CI

---

## Quick Start

### 1. Start Backend Services & Infrastructure

Run the backend services, PostgreSQL, and RabbitMQ with Docker Compose:

```bash
docker compose up --build
```

Optional `.env` overrides supported by `docker-compose.yml` (see `.env.example`):

* `POSTGRES_USER` (default: `postgres`), `POSTGRES_PASSWORD` (default: `postgres`)
* `RABBITMQ_USER` (default: `guest`), `RABBITMQ_PASSWORD` (default: `guest`)

Useful Docker commands:

* **Stop services (keeps database data and uploaded images):** `docker compose down`
* **Reset everything (deletes `pgdata` and `fleet_uploads` volumes):** `docker compose down -v`

### 2. Start Frontend Application

In a separate terminal, install dependencies and run the Vite dev server:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite proxies `/api/fleet`, `/api/booking`, `/api/payment`, `/api/notification`, and `/api/analytics` to ports `3001` through `3005`.

---

## Frontend Views

The web app includes a live health bar for all five services and six tabs:

* **Explore Vehicles:** Browse available vehicles with photos, search by make/model/plate, filter by category, seed sample vehicles, and create bookings.
* **Reservations & Payments:** Track bookings, pay pending invoices (card or cash), view printable invoices, and cancel bookings.
* **Rental Counter Desk:** Handle vehicle pickups and returns with automatic late-fee calculation.
* **Fleet Inventory:** Register vehicles with image upload (JPEG/PNG/WEBP/GIF up to 5MB) or image URL, edit details, delete vehicles, and switch status (`AVAILABLE`, `MAINTENANCE`, `RETIRED`).
* **Live Event Stream:** View notification logs triggered by booking and payment events.
* **Executive Analytics:** Inspect gross revenue, refunds, net revenue, event throughput, and financial stream metrics.

---

## Useful Endpoints & Tools

* **Frontend App:** `http://localhost:5173`
* **Swagger API Docs:**
  * Fleet: `http://localhost:3001/docs`
  * Booking: `http://localhost:3002/docs`
  * Payment: `http://localhost:3003/docs`
  * Notification: `http://localhost:3004/docs`
  * Analytics: `http://localhost:3005/docs`
* **RabbitMQ Management UI:** `http://localhost:15672` (default credentials: `guest` / `guest`)
* **Postman Collection:** Import `docs/postman/drivehub.postman_collection.json` and run folders sequentially.

---

## Business Flow

**Booking Lifecycle:** `PENDING` -> `CONFIRMED` -> `PICKED_UP` -> `RETURNED` (or `CANCELLED` from `PENDING` / `CONFIRMED`)

1. **Fleet Setup:** Vendors add vehicles in `fleet-service` (`POST /vehicles`), optionally uploading a photo via `POST /vehicles/upload` or providing an `imageUrl`.
2. **Create Booking:** `POST /bookings` checks vehicle status with `fleet-service`, prevents overlapping date ranges using a PostgreSQL advisory lock, creates a `PENDING` booking, and emits `booking.created`.
3. **Generate Payment:** `payment-service` consumes `booking.created` and creates a payment request (`rental price + 20% refundable deposit`).
4. **Process Payment:** `POST /payments/{id}/pay` processes payment. Demo rule: card numbers ending in `0000` are declined (`FAILED`); any other card or cash succeeds and emits `payment.completed`.
5. **Confirm & Pickup:** `booking-service` marks the booking `CONFIRMED`. Pickup is allowed only for confirmed bookings.
6. **Vehicle Return:** Returns calculate late fees at **1.5x the daily rate** per late day, and `payment-service` refunds the deposit minus any late fee.
7. **Cancellation:** Cancelling a paid booking triggers a full refund.
8. **Notifications & Analytics:** `notification-service` logs customer notifications and `analytics-service` aggregates live business metrics.

---

## Testing

* **End-to-End Smoke Test** (requires `docker compose up` running):
  ```bash
  node scripts/e2e.mjs
  ```
* **Unit Tests (per service):**
  ```bash
  cd services/<service-name>
  npm test
  ```
  Example: `cd services/fleet-service && npm test` (or `node --test tests/unit/<serviceName>.test.mjs` with Node 22).
* **Typecheck & Frontend Build:**
  ```bash
  cd services/fleet-service && npm run typecheck
  cd frontend && npm run build
  ```

---

## Local Development (Single Service)

PostgreSQL (`5432`) and RabbitMQ (`5672` AMQP / `15672` UI) expose host ports so you can run an individual service locally with hot reload:

1. **Start infrastructure:**
   ```bash
   docker compose up -d postgres rabbitmq
   ```

2. **Install dependencies and start a service:**
   ```bash
   cd services/fleet-service
   npm install
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/fleetdb PORT=3001 npm run dev
   ```

Environment variables for other services when running outside Docker:

* **Database URLs:** `bookingdb`, `paymentdb`, `notificationdb`, or `analyticsdb` on `localhost:5432`.
* **RabbitMQ** (`booking`, `payment`, `notification`, `analytics`): `RABBITMQ_URL=amqp://guest:guest@localhost:5672`
* **Service URLs:** `FLEET_URL=http://localhost:3001` (Booking & Analytics), plus `BOOKING_URL=http://localhost:3002`, `PAYMENT_URL=http://localhost:3003`, and `NOTIFY_URL=http://localhost:3004` for Analytics.

---

## Repository Structure

```text
├── frontend/                   # React + Vite + Tailwind CSS web application
│   ├── src/
│   │   ├── api/                # Typed REST API client
│   │   ├── components/         # Tabs & modals (Vehicles, Fleet, Counter, Analytics, etc.)
│   │   └── types/              # Shared TypeScript interfaces
│   └── vite.config.ts          # Dev server & /api/* reverse proxy
├── services/
│   └── <name>-service/
│       ├── src/
│       │   ├── index.ts        # Express routes, validation & server startup
│       │   ├── db.ts           # PostgreSQL pool & connection retry
│       │   └── events.ts       # RabbitMQ publishers & consumers
│       ├── openapi.yaml        # Swagger / OpenAPI specification
│       └── Dockerfile
├── infra/
│   └── postgres/init.sql       # Creates isolated databases per service
├── docs/
│   └── postman/                # Postman API collection
├── scripts/
│   └── e2e.mjs                 # End-to-end smoke test script
├── tests/
│   └── unit/                   # Service unit tests
├── docker-compose.yml          # Multi-container backend + DB + RabbitMQ stack
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
