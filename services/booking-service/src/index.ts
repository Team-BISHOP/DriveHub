import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { pool, waitForDb } from "./db";
import { connectBroker, publish, subscribe } from "./events";

let publishEvent = publish;
export function setPublishForTests(handler: typeof publish): void {
    publishEvent = handler;
}

const PORT = Number(process.env.PORT ?? 3002);
const FLEET_URL = process.env.FLEET_URL ?? "http://localhost:3001";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const DEPOSIT_RATE = 0.2; // deposit = 20% of the rental price
const LATE_FEE_MULTIPLIER = 1.5; // each late day costs 1.5x the daily rate

export const app = express();
app.use(express.json());

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// ---------- helpers ----------
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const dayDiff = (from: string, to: string) =>
    Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
const money = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    return id;
};

const toBooking = (r: any) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    startDate: r.start_date,
    endDate: r.end_date,
    dailyRate: r.daily_rate,
    totalPrice: r.total_price,
    deposit: r.deposit,
    lateFee: r.late_fee,
    status: r.status,
    pickedUpAt: r.picked_up_at,
    returnedAt: r.returned_at,
});

async function getBooking(id: number) {
    const { rows } = await pool.query("SELECT * FROM bookings WHERE id = $1", [id]);
    if (!rows[0]) throw new HttpError(404, "Booking not found");
    return rows[0];
}

export async function handlePaymentCompleted(booking: { bookingId: number }): Promise<void> {
    const { rows } = await pool.query(
        "UPDATE bookings SET status='CONFIRMED' WHERE id=$1 AND status='PENDING' RETURNING *",
        [booking.bookingId]
    );
    if (rows[0]) publishEvent("booking.confirmed", { bookingId: rows[0].id, customerEmail: rows[0].customer_email });
}

// ---------- routes ----------
app.get("/health", (_req, res) => res.json({ status: "ok", service: "booking-service" }));

// Scenario 1: customer books a vehicle
const createSchema = z.object({
    vehicleId: z.number().int().positive(),
    customerName: z.string().min(1),
    customerEmail: z.string().email(),
    startDate: dateStr,
    endDate: dateStr,
});

app.post("/bookings", async (req, res) => {
    const b = createSchema.parse(req.body);
    const days = dayDiff(b.startDate, b.endDate);
    if (days < 0) throw new HttpError(400, "endDate must be on or after startDate");
    const rentalDays = Math.max(1, days); // same-day rental counts as 1 day

    // 1) Ask the Fleet service about the vehicle (REST call between services)
    let vehicle: any;
    try {
        const r = await fetch(`${FLEET_URL}/vehicles/${b.vehicleId}`);
        if (r.status === 404) throw new HttpError(404, "Vehicle not found");
        if (!r.ok) throw new Error(`Fleet service returned ${r.status}`);
        vehicle = await r.json();
    } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(503, "Fleet service unavailable, try again shortly");
    }
    if (vehicle.status !== "AVAILABLE") throw new HttpError(409, `Vehicle is ${vehicle.status}`);

    const totalPrice = money(rentalDays * vehicle.dailyRate);
    const deposit = money(totalPrice * DEPOSIT_RATE);

    // 2) Check for date overlap and insert, inside one transaction.
    //    The advisory lock makes two simultaneous requests for the same vehicle take turns,
    //    which prevents double booking.
    const client = await pool.connect();
    let row: any;
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [b.vehicleId]);
        const clash = await client.query(
            `SELECT 1 FROM bookings
       WHERE vehicle_id = $1 AND status IN ('PENDING','CONFIRMED','PICKED_UP')
         AND start_date <= $3 AND end_date >= $2`,
            [b.vehicleId, b.startDate, b.endDate]
        );
        if (clash.rowCount) throw new HttpError(409, "Vehicle is already booked for these dates");
        const ins = await client.query(
            `INSERT INTO bookings (vehicle_id, customer_name, customer_email, start_date, end_date, daily_rate, total_price, deposit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [b.vehicleId, b.customerName, b.customerEmail, b.startDate, b.endDate, vehicle.dailyRate, totalPrice, deposit]
        );
        row = ins.rows[0];
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }

    // 3) Tell the other services (Payment will create a payment request)
    publishEvent("booking.created", {
        bookingId: row.id,
        customerEmail: row.customer_email,
        totalPrice: row.total_price,
        deposit: row.deposit,
    });
    res.status(201).json(toBooking(row));
});

app.get("/bookings", async (req, res) => {
    const params: any[] = [];
    let sql = "SELECT * FROM bookings";
    if (req.query.status) {
        params.push(String(req.query.status).toUpperCase());
        sql += " WHERE status = $1";
    }
    const { rows } = await pool.query(sql + " ORDER BY id", params);
    res.json(rows.map(toBooking));
});

app.get("/bookings/:id", async (req, res) => {
    res.json(toBooking(await getBooking(idParam(req))));
});

app.post("/bookings/:id/cancel", async (req, res) => {
    const b = await getBooking(idParam(req));
    if (!["PENDING", "CONFIRMED"].includes(b.status)) throw new HttpError(409, `Cannot cancel a ${b.status} booking`);
    const { rows } = await pool.query("UPDATE bookings SET status='CANCELLED' WHERE id=$1 RETURNING *", [b.id]);
    publishEvent("booking.cancelled", { bookingId: b.id, customerEmail: b.customer_email });
    res.json(toBooking(rows[0]));
});

// Scenario 4: vehicle pickup and return
app.post("/bookings/:id/pickup", async (req, res) => {
    const b = await getBooking(idParam(req));
    if (b.status !== "CONFIRMED") throw new HttpError(409, `Only CONFIRMED (paid) bookings can be picked up, this one is ${b.status}`);
    const { rows } = await pool.query("UPDATE bookings SET status='PICKED_UP', picked_up_at=now() WHERE id=$1 RETURNING *", [b.id]);
    publishEvent("booking.picked_up", { bookingId: b.id, customerEmail: b.customer_email });
    res.json(toBooking(rows[0]));
});

// Optional body { "returnDate": "YYYY-MM-DD" } lets you simulate a late return in the demo
app.post("/bookings/:id/return", async (req, res) => {
    const b = await getBooking(idParam(req));
    if (b.status !== "PICKED_UP") throw new HttpError(409, `Only PICKED_UP bookings can be returned, this one is ${b.status}`);
    const { returnDate } = z.object({ returnDate: dateStr.optional() }).parse(req.body ?? {});
    const lateDays = Math.max(0, dayDiff(b.end_date, returnDate ?? today()));
    const lateFee = money(lateDays * b.daily_rate * LATE_FEE_MULTIPLIER);
    const { rows } = await pool.query(
        "UPDATE bookings SET status='RETURNED', returned_at=now(), late_fee=$2 WHERE id=$1 RETURNING *",
        [b.id, lateFee]
    );
    publishEvent("booking.returned", {
        bookingId: b.id,
        customerEmail: b.customer_email,
        deposit: b.deposit,
        lateFee,
        lateDays,
    });
    res.json(toBooking(rows[0]));
});

// ---------- error handling ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.issues });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

// ---------- startup ----------
async function main() {
    await waitForDb();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id             SERIAL PRIMARY KEY,
      vehicle_id     INT NOT NULL,
      customer_name  TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      start_date     DATE NOT NULL,
      end_date       DATE NOT NULL,
      daily_rate     NUMERIC(10,2) NOT NULL,
      total_price    NUMERIC(10,2) NOT NULL,
      deposit        NUMERIC(10,2) NOT NULL,
      late_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'PENDING',
      picked_up_at   TIMESTAMPTZ,
      returned_at    TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await connectBroker(RABBITMQ_URL);

    // When payment succeeds, the booking becomes CONFIRMED
    await subscribe("booking-service.q", ["payment.completed"], async (_key, p) => handlePaymentCompleted(p));

    app.listen(PORT, () => console.log(`booking-service on :${PORT} (docs at /docs)`));
}
if (process.env.NODE_ENV !== "test") {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
