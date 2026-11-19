import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
createRequire(new URL("../../services/payment-service/package.json", import.meta.url))("tsx/esm/api").register();
const service = await import("../../services/payment-service/src/index.ts");
const { app } = service;
const { pool } = await import("../../services/payment-service/src/db.ts");

async function withServer(run) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const payment = (overrides = {}) => ({
    id: 1, booking_id: 7, customer_email: "a@test.com", amount: 120,
    deposit: 24, refund_amount: 0, status: "PENDING", method: null, ...overrides,
});
const request = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("health endpoint", async () => withServer(async (url) => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "payment-service" });
}));

test("lists payments with optional booking filter", async () => {
    const original = pool.query;
    const calls = [];
    pool.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [payment()], rowCount: 1 }; };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/payments`)).status, 200);
            assert.deepEqual(calls[0].params, []);
            const filtered = await fetch(`${url}/payments?bookingId=7`);
            assert.equal(filtered.status, 200);
            assert.deepEqual(calls[1].params, [7]);
            assert.equal((await filtered.json())[0].bookingId, 7);
        });
    } finally { pool.query = original; }
});

test("gets payment by id and handles invalid or absent payment", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => params[0] === 1 ? { rows: [payment()] } : { rows: [] };
    try {
        await withServer(async (url) => {
            const found = await fetch(`${url}/payments/1`);
            assert.equal(found.status, 200);
            assert.deepEqual(await found.json(), { id: 1, bookingId: 7, customerEmail: "a@test.com", amount: 120, deposit: 24, refundAmount: 0, status: "PENDING", method: null });
            assert.equal((await fetch(`${url}/payments/not-an-id`)).status, 400);
            assert.equal((await fetch(`${url}/payments/9`)).status, 404);
        });
    } finally { pool.query = original; }
});

test("payment payload validates method and card format and requires card number", async () => withServer(async (url) => {
    assert.equal((await fetch(`${url}/payments/1/pay`, request({ method: "CRYPTO" }))).status, 400);
    assert.equal((await fetch(`${url}/payments/1/pay`, request({ method: "CARD", cardNumber: "12" }))).status, 400);
    const missingCard = await fetch(`${url}/payments/1/pay`, request({ method: "CARD" }));
    assert.equal(missingCard.status, 400);
    assert.deepEqual(await missingCard.json(), { error: "cardNumber is required for CARD payments" });
}));

test("accepts cash and valid card payments and publishes completion", async () => {
    const original = pool.query;
    const events = [];
    service.setPublishForTests((key, payload) => events.push({ key, payload }));
    pool.query = async (sql) => sql.startsWith("SELECT")
        ? { rows: [payment()] }
        : { rows: [payment({ status: "PAID", method: "CARD" })] };
    try {
        await withServer(async (url) => {
            const cash = await fetch(`${url}/payments/1/pay`, request({ method: "CASH" }));
            assert.equal(cash.status, 200);
            assert.equal((await cash.json()).status, "PAID");
            const card = await fetch(`${url}/payments/1/pay`, request({ method: "CARD", cardNumber: "4111111111111111" }));
            assert.equal(card.status, 200);
            assert.deepEqual(events.map((event) => event.key), ["payment.completed", "payment.completed"]);
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("declines card number ending in 0000", async () => {
    const original = pool.query;
    let event;
    service.setPublishForTests((key, payload) => { event = { key, payload }; });
    pool.query = async (sql) => sql.startsWith("SELECT")
        ? { rows: [payment()] }
        : { rows: [payment({ status: "FAILED", method: "CARD" })] };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/payments/1/pay`, request({ method: "CARD", cardNumber: "4111111111110000" }));
            assert.equal(response.status, 402);
            assert.equal((await response.json()).status, "FAILED");
            assert.equal(event.key, "payment.failed");
            assert.equal(event.payload.reason, "Card declined");
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("payment rejects paid state and missing payment when paying", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => params?.[0] === 1 ? { rows: [payment({ status: "PAID" })] } : { rows: [] };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/payments/1/pay`, request({ method: "CASH" }))).status, 409);
            assert.equal((await fetch(`${url}/payments/9/pay`, request({ method: "CASH" }))).status, 404);
        });
    } finally { pool.query = original; }
});

test("booking.created opens payment for rental amount plus deposit, rounded to cents", async () => {
    const original = pool.query;
    let captured;
    pool.query = async (sql, params) => { captured = { sql, params }; return { rows: [], rowCount: 0 }; };
    try {
        await service.handleBookingEvent("booking.created", { bookingId: 5, customerEmail: "a@test.com", totalPrice: 124.55, deposit: 24.91 });
        assert.match(captured.sql, /ON CONFLICT \(booking_id\) DO NOTHING/);
        assert.deepEqual(captured.params, [5, "a@test.com", 149.46, 24.91]);
    } finally { pool.query = original; }
});

test("booking.cancelled fully refunds a paid payment and publishes refund event", async () => {
    const original = pool.query;
    const calls = [];
    let event;
    service.setPublishForTests((key, payload) => { event = { key, payload }; });
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        return sql.startsWith("SELECT") ? { rows: [payment({ status: "PAID" })] } : { rows: [], rowCount: 1 };
    };
    try {
        await service.handleBookingEvent("booking.cancelled", { bookingId: 7 });
        assert.match(calls[1].sql, /status='REFUNDED', refund_amount=amount/);
        assert.deepEqual(event, { key: "payment.refunded", payload: { paymentId: 1, bookingId: 7, customerEmail: "a@test.com", refundAmount: 120, reason: "Booking cancelled" } });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("booking.cancelled closes pending and failed payment requests without refund", async () => {
    const original = pool.query;
    const updates = [];
    let status = "PENDING";
    let published = false;
    service.setPublishForTests(() => { published = true; });
    pool.query = async (sql) => {
        if (sql.startsWith("SELECT")) return { rows: [payment({ status })] };
        updates.push(sql);
        return { rows: [], rowCount: 1 };
    };
    try {
        await service.handleBookingEvent("booking.cancelled", { bookingId: 7 });
        status = "FAILED";
        await service.handleBookingEvent("booking.cancelled", { bookingId: 7 });
        status = "REFUNDED";
        await service.handleBookingEvent("booking.cancelled", { bookingId: 7 });
        assert.equal(updates.length, 2);
        assert.ok(updates.every((sql) => sql.includes("status='CANCELLED'")));
        assert.equal(published, false);
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("booking.returned returns deposit minus late fee, never below zero", async () => {
    const original = pool.query;
    const events = [];
    service.setPublishForTests((key, payload) => events.push({ key, payload }));
    pool.query = async () => ({ rows: [payment({ status: "PAID", deposit: 25 })] });
    try {
        await service.handleBookingEvent("booking.returned", { bookingId: 7, lateFee: 10 });
        await service.handleBookingEvent("booking.returned", { bookingId: 7, lateFee: 40 });
        await service.handleBookingEvent("booking.returned", { bookingId: 7, lateFee: 0 });
        assert.deepEqual(events.map(({ payload }) => payload.refundAmount), [15, 0, 25]);
        assert.match(events[0].payload.reason, /late fee of 10/);
        assert.equal(events[2].payload.reason, "Deposit returned");
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("booking event handlers ignore missing payments and non-paid returns", async () => {
    const original = pool.query;
    let status = "PAID";
    let publishCount = 0;
    service.setPublishForTests(() => { publishCount++; });
    pool.query = async (_sql, params) => params?.[0] === 99 ? { rows: [] } : { rows: [payment({ status })] };
    try {
        await service.handleBookingEvent("booking.cancelled", { bookingId: 99 });
        await service.handleBookingEvent("booking.returned", { bookingId: 99, lateFee: 0 });
        status = "CANCELLED";
        await service.handleBookingEvent("booking.returned", { bookingId: 7, lateFee: 0 });
        assert.equal(publishCount, 0);
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});
