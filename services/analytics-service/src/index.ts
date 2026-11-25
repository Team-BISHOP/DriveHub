import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { pool, waitForDb } from "./db";
import { connectBroker, subscribe } from "./events";

const PORT = Number(process.env.PORT ?? 3005);
const FLEET_URL = process.env.FLEET_URL ?? "http://localhost:3001";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

export const app = express();
app.use(express.json());

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

app.get(["/health", "/analytics/health"], (_req, res) => res.json({ status: "ok", service: "analytics-service" }));

// Summary KPI endpoint
app.get(["/summary", "/analytics/summary"], async (_req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE event = 'payment.completed'), 0)::numeric as gross_revenue,
                COALESCE(SUM(amount) FILTER (WHERE event = 'payment.refunded'), 0)::numeric as total_refunds,
                COALESCE(SUM((payload->>'lateFee')::numeric) FILTER (WHERE event = 'booking.returned'), 0)::numeric as late_fees,
                COUNT(*) FILTER (WHERE event = 'booking.created')::int as total_bookings,
                COUNT(*) FILTER (WHERE event = 'booking.confirmed')::int as confirmed_bookings,
                COUNT(*) FILTER (WHERE event = 'booking.picked_up')::int as picked_up_count,
                COUNT(*) FILTER (WHERE event = 'booking.returned')::int as returned_count,
                COUNT(*) FILTER (WHERE event = 'booking.cancelled')::int as cancelled_bookings,
                COUNT(*) FILTER (WHERE event = 'payment.failed')::int as failed_payments
            FROM analytics_events
        `);

        const r = rows[0] || {};
        const grossRevenue = Number(r.gross_revenue || 0);
        const totalRefunds = Number(r.total_refunds || 0);
        const netRevenue = Math.round((grossRevenue - totalRefunds) * 100) / 100;
        const lateFeesCollected = Number(r.late_fees || 0);
        const totalBookings = Number(r.total_bookings || 0);
        const confirmedBookings = Number(r.confirmed_bookings || 0);
        const pickedUpCount = Number(r.picked_up_count || 0);
        const returnedCount = Number(r.returned_count || 0);
        const activeRentals = Math.max(0, pickedUpCount - returnedCount);
        const completedRentals = returnedCount;
        const cancelledBookings = Number(r.cancelled_bookings || 0);
        const failedPayments = Number(r.failed_payments || 0);

        // Fetch fleet total from fleet-service
        let fleetTotal = 0;
        const fleetEndpoints = [FLEET_URL, "http://fleet-service:3001", "http://localhost:3001"];
        for (const ep of fleetEndpoints) {
            try {
                const fRes = await fetch(`${ep}/vehicles`, { signal: AbortSignal.timeout(1500) });
                if (fRes.ok) {
                    const fleetData = await fRes.json();
                    if (Array.isArray(fleetData)) {
                        fleetTotal = fleetData.length;
                        break;
                    }
                }
            } catch {}
        }

        const fleetUtilization = fleetTotal > 0 ? Math.round((activeRentals / fleetTotal) * 1000) / 10 : 0;

        res.json({
            grossRevenue,
            totalRefunds,
            netRevenue,
            lateFeesCollected,
            totalBookings,
            confirmedBookings,
            activeRentals,
            completedRentals,
            cancelledBookings,
            failedPayments,
            fleetTotal,
            fleetUtilization,
        });
    } catch (err) {
        next(err);
    }
});

// Event throughput counters
app.get(["/events", "/analytics/events"], async (_req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                event,
                COUNT(*)::int as count,
                MAX(created_at) as "lastOccurred"
            FROM analytics_events
            GROUP BY event
            ORDER BY count DESC
        `);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// Financial stream log
app.get(["/financial-stream", "/analytics/financial-stream"], async (_req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                event,
                booking_id as "bookingId",
                customer_email as "customerEmail",
                amount,
                created_at as "createdAt"
            FROM analytics_events
            WHERE event IN ('payment.completed', 'payment.refunded', 'booking.returned')
            ORDER BY id DESC
            LIMIT 25
        `);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// Manual sync endpoint
app.post(["/sync", "/analytics/sync"], async (_req, res) => {
    const count = await syncHistoricalData();
    res.json({ synced: count });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

export async function syncHistoricalData(): Promise<number> {
    try {
        const bookingUrls = [process.env.BOOKING_URL, "http://booking-service:3002", "http://localhost:3002"].filter(Boolean) as string[];
        const paymentUrls = [process.env.PAYMENT_URL, "http://payment-service:3003", "http://localhost:3003"].filter(Boolean) as string[];
        const notifyUrls = [process.env.NOTIFY_URL, "http://notification-service:3004", "http://localhost:3004"].filter(Boolean) as string[];

        let bookings: any[] = [];
        for (const u of bookingUrls) {
            try {
                const r = await fetch(`${u}/bookings`, { signal: AbortSignal.timeout(2000) });
                if (r.ok) { bookings = await r.json(); break; }
            } catch {}
        }

        let payments: any[] = [];
        for (const u of paymentUrls) {
            try {
                const r = await fetch(`${u}/payments`, { signal: AbortSignal.timeout(2000) });
                if (r.ok) { payments = await r.json(); break; }
            } catch {}
        }

        let notifications: any[] = [];
        for (const u of notifyUrls) {
            try {
                const r = await fetch(`${u}/notifications`, { signal: AbortSignal.timeout(2000) });
                if (r.ok) { notifications = await r.json(); break; }
            } catch {}
        }

        let synced = 0;
        const existingCountRes = await pool.query("SELECT COUNT(*)::int as count FROM analytics_events");
        const existingCount = existingCountRes.rows[0]?.count || 0;

        if (existingCount === 0 && (notifications.length > 0 || bookings.length > 0)) {
            console.log(`Backfilling analytics from historical data (${bookings.length} bookings, ${payments.length} payments, ${notifications.length} events)...`);
            
            if (notifications.length > 0) {
                for (const n of notifications) {
                    let amount = 0;
                    if (n.event === "payment.completed") {
                        const matchedPay = payments.find((p: any) => p.bookingId === n.bookingId);
                        amount = matchedPay ? Number(matchedPay.amount) : 0;
                    } else if (n.event === "payment.refunded") {
                        const matchedPay = payments.find((p: any) => p.bookingId === n.bookingId);
                        amount = matchedPay ? Number(matchedPay.refundAmount) : 0;
                    } else if (n.event === "booking.returned") {
                        const matchedBooking = bookings.find((b: any) => b.id === n.bookingId);
                        amount = matchedBooking ? Number(matchedBooking.lateFee) : 0;
                    }

                    await pool.query(
                        `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            n.event,
                            n.bookingId ?? null,
                            n.recipient || "unknown",
                            amount,
                            JSON.stringify(n),
                            n.sentAt ? new Date(n.sentAt) : new Date(),
                        ]
                    );
                    synced++;
                }
            } else {
                for (const b of bookings) {
                    await pool.query(
                        `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                         VALUES ($1, $2, $3, $4, $5)`,
                        ["booking.created", b.id, b.customerEmail, b.totalPrice, JSON.stringify(b)]
                    );
                    synced++;

                    if (['CONFIRMED', 'PICKED_UP', 'RETURNED'].includes(b.status)) {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["booking.confirmed", b.id, b.customerEmail, 0, JSON.stringify(b)]
                        );
                        synced++;
                    }
                    if (['PICKED_UP', 'RETURNED'].includes(b.status)) {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["booking.picked_up", b.id, b.customerEmail, 0, JSON.stringify(b)]
                        );
                        synced++;
                    }
                    if (b.status === 'RETURNED') {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["booking.returned", b.id, b.customerEmail, b.lateFee || 0, JSON.stringify(b)]
                        );
                        synced++;
                    }
                    if (b.status === 'CANCELLED') {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["booking.cancelled", b.id, b.customerEmail, 0, JSON.stringify(b)]
                        );
                        synced++;
                    }
                }

                for (const p of payments) {
                    if (['PAID', 'DEPOSIT_RETURNED', 'REFUNDED'].includes(p.status)) {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["payment.completed", p.bookingId, p.customerEmail, p.amount, JSON.stringify(p)]
                        );
                        synced++;
                    }
                    if (Number(p.refundAmount) > 0) {
                        await pool.query(
                            `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
                             VALUES ($1, $2, $3, $4, $5)`,
                            ["payment.refunded", p.bookingId, p.customerEmail, p.refundAmount, JSON.stringify(p)]
                        );
                        synced++;
                    }
                }
            }
            console.log(`Synced ${synced} historical events into analytics.`);
        }
        return synced;
    } catch (err) {
        console.error("Historical sync error:", err);
        return 0;
    }
}

export async function handleAnalyticsEvent(key: string, payload: any): Promise<void> {
    let amount = 0;
    if (key === "payment.completed") amount = Number(payload.amount ?? 0);
    else if (key === "payment.refunded") amount = Number(payload.refundAmount ?? 0);
    else if (key === "booking.returned") amount = Number(payload.lateFee ?? 0);

    await pool.query(
        `INSERT INTO analytics_events (event, booking_id, customer_email, amount, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
            key,
            payload.bookingId ?? null,
            payload.customerEmail ?? "unknown",
            amount,
            JSON.stringify(payload),
        ]
    );
}

async function main() {
    await waitForDb();
    await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
            id SERIAL PRIMARY KEY,
            event TEXT NOT NULL,
            booking_id INT,
            customer_email TEXT,
            amount NUMERIC(10, 2) DEFAULT 0,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events (event);
    `);

    // Backfill historical events if any exist
    await syncHistoricalData();

    await connectBroker(RABBITMQ_URL);

    // Listen to all events published in DriveHub
    await subscribe("analytics-service.q", ["booking.*", "payment.*"], handleAnalyticsEvent);

    app.listen(PORT, () => console.log(`analytics-service on :${PORT} (docs at /docs)`));
}

if (process.env.NODE_ENV !== "test") {
    main().catch((err) => {
        console.error("analytics-service failed to start:", err);
        process.exit(1);
    });
}
