import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { pool, waitForDb } from "./db";
import { connectBroker, subscribe } from "./events";

const PORT = Number(process.env.PORT ?? 3004);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const app = express();
app.use(express.json());

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

// Turn an event into a human-readable message.
// To support a new event, add one line here and bind its routing key in main().
function buildMessage(key: string, e: any): string {
    switch (key) {
        case "booking.created":
            return `Booking #${e.bookingId} received. Please pay ${e.totalPrice + e.deposit} (includes a refundable deposit of ${e.deposit}).`;
        case "booking.confirmed":
            return `Booking #${e.bookingId} is confirmed. Your vehicle is reserved.`;
        case "booking.cancelled":
            return `Booking #${e.bookingId} was cancelled.`;
        case "booking.picked_up":
            return `Booking #${e.bookingId}: vehicle picked up. Enjoy your trip!`;
        case "booking.returned":
            return e.lateFee > 0
                ? `Booking #${e.bookingId}: vehicle returned ${e.lateDays} day(s) late. Late fee: ${e.lateFee}.`
                : `Booking #${e.bookingId}: vehicle returned on time. Thank you!`;
        case "payment.completed":
            return `Payment of ${e.amount} received for booking #${e.bookingId}.`;
        case "payment.failed":
            return `Payment failed for booking #${e.bookingId} (${e.reason}). Please try again.`;
        case "payment.refunded":
            return `Refund of ${e.refundAmount} issued for booking #${e.bookingId}. Reason: ${e.reason}.`;
        default:
            return `Update for booking #${e.bookingId}: ${key}`;
    }
}

// Scenario 5: list the notifications that were sent
app.get("/health", (_req, res) => res.json({ status: "ok", service: "notification-service" }));

app.get("/notifications", async (req, res) => {
    const params: any[] = [];
    let sql = "SELECT * FROM notifications";
    if (req.query.bookingId) {
        params.push(Number(req.query.bookingId));
        sql += " WHERE booking_id = $1";
    }
    const { rows } = await pool.query(sql + " ORDER BY id", params);
    res.json(
        rows.map((r) => ({
            id: r.id,
            event: r.event,
            bookingId: r.booking_id,
            recipient: r.recipient,
            message: r.message,
            sentAt: r.created_at,
        }))
    );
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

async function main() {
    await waitForDb();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      event      TEXT NOT NULL,
      booking_id INT,
      recipient  TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await connectBroker(RABBITMQ_URL);

    // Listen to every booking.* and payment.* event
    await subscribe("notification-service.q", ["booking.*", "payment.*"], async (key, e) => {
        const message = buildMessage(key, e);
        const recipient = e.customerEmail ?? "unknown";
        await pool.query(
            "INSERT INTO notifications (event, booking_id, recipient, message) VALUES ($1,$2,$3,$4)",
            [key, e.bookingId ?? null, recipient, message]
        );
        // Mock delivery: a real system would call an email or SMS provider here
        console.log(`[EMAIL to ${recipient}] ${message}`);
    });

    app.listen(PORT, () => console.log(`notification-service on :${PORT} (docs at /docs)`));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
