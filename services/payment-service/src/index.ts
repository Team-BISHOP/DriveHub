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

const PORT = Number(process.env.PORT ?? 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

export const app = express();
app.use(express.json());

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const money = (n: number) => Math.round(n * 100) / 100;

const toPayment = (r: any) => ({
    id: r.id,
    bookingId: r.booking_id,
    customerEmail: r.customer_email,
    amount: r.amount,
    deposit: r.deposit,
    refundAmount: r.refund_amount,
    status: r.status,
    method: r.method,
});

const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    return id;
};

export async function handleBookingEvent(key: string, event: any): Promise<void> {
    if (key === "booking.created") {
        await pool.query(
            `INSERT INTO payments (booking_id, customer_email, amount, deposit)
       VALUES ($1,$2,$3,$4) ON CONFLICT (booking_id) DO NOTHING`,
            [event.bookingId, event.customerEmail, money(event.totalPrice + event.deposit), event.deposit]
        );
        return;
    }

    const { rows } = await pool.query("SELECT * FROM payments WHERE booking_id = $1", [event.bookingId]);
    const payment = rows[0];
    if (!payment) return;

    if (key === "booking.cancelled") {
        if (payment.status === "PAID") {
            await pool.query("UPDATE payments SET status='REFUNDED', refund_amount=amount, updated_at=now() WHERE id=$1", [payment.id]);
            publishEvent("payment.refunded", {
                paymentId: payment.id, bookingId: payment.booking_id, customerEmail: payment.customer_email,
                refundAmount: payment.amount, reason: "Booking cancelled",
            });
        } else if (["PENDING", "FAILED"].includes(payment.status)) {
            await pool.query("UPDATE payments SET status='CANCELLED', updated_at=now() WHERE id=$1", [payment.id]);
        }
        return;
    }

    if (key === "booking.returned" && payment.status === "PAID") {
        const refund = Math.max(0, money(payment.deposit - event.lateFee));
        await pool.query("UPDATE payments SET status='DEPOSIT_RETURNED', refund_amount=$2, updated_at=now() WHERE id=$1", [payment.id, refund]);
        publishEvent("payment.refunded", {
            paymentId: payment.id, bookingId: payment.booking_id, customerEmail: payment.customer_email,
            refundAmount: refund, reason: event.lateFee > 0 ? `Deposit returned minus late fee of ${event.lateFee}` : "Deposit returned",
        });
    }
}

// ---------- routes ----------
app.get("/health", (_req, res) => res.json({ status: "ok", service: "payment-service" }));

app.get("/payments", async (req, res) => {
    const params: any[] = [];
    let sql = "SELECT * FROM payments";
    if (req.query.bookingId) {
        params.push(Number(req.query.bookingId));
        sql += " WHERE booking_id = $1";
    }
    const { rows } = await pool.query(sql + " ORDER BY id", params);
    res.json(rows.map(toPayment));
});

app.get("/payments/:id", async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM payments WHERE id = $1", [idParam(req)]);
    if (!rows[0]) throw new HttpError(404, "Payment not found");
    res.json(toPayment(rows[0]));
});

// Scenario 2: customer pays (mock gateway)
// Demo rule: a card number ending in 0000 is declined, anything else is accepted.
const paySchema = z.object({
    method: z.enum(["CARD", "CASH"]),
    cardNumber: z.string().regex(/^\d{12,19}$/, "Card number must be 12 to 19 digits").optional(),
});

app.post("/payments/:id/pay", async (req, res) => {
    const id = idParam(req);
    const body = paySchema.parse(req.body);
    if (body.method === "CARD" && !body.cardNumber) throw new HttpError(400, "cardNumber is required for CARD payments");

    const { rows } = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
    const p = rows[0];
    if (!p) throw new HttpError(404, "Payment not found");
    if (!["PENDING", "FAILED"].includes(p.status)) throw new HttpError(409, `Payment is already ${p.status}`);

    const declined = body.method === "CARD" && body.cardNumber!.endsWith("0000");
    const status = declined ? "FAILED" : "PAID";
    const upd = await pool.query(
        "UPDATE payments SET status=$2, method=$3, updated_at=now() WHERE id=$1 RETURNING *",
        [id, status, body.method]
    );
    const out = upd.rows[0];

    const base = { paymentId: out.id, bookingId: out.booking_id, customerEmail: out.customer_email, amount: out.amount };
    if (declined) publishEvent("payment.failed", { ...base, reason: "Card declined" });
    else publishEvent("payment.completed", base);

    res.status(declined ? 402 : 200).json(toPayment(out));
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
    CREATE TABLE IF NOT EXISTS payments (
      id             SERIAL PRIMARY KEY,
      booking_id     INT NOT NULL UNIQUE,
      customer_email TEXT NOT NULL,
      amount         NUMERIC(10,2) NOT NULL,
      deposit        NUMERIC(10,2) NOT NULL,
      refund_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'PENDING',
      method         TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await connectBroker(RABBITMQ_URL);

    await subscribe("payment-service.q", ["booking.created", "booking.cancelled", "booking.returned"], handleBookingEvent);

    app.listen(PORT, () => console.log(`payment-service on :${PORT} (docs at /docs)`));
}
if (process.env.NODE_ENV !== "test") {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
