import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
createRequire(new URL("../../services/notification-service/package.json", import.meta.url))("tsx/esm/api").register();
const { app, buildMessage, handleNotificationEvent } = await import("../../services/notification-service/src/index.ts");
const { pool } = await import("../../services/notification-service/src/db.ts");

async function withServer(run) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("health endpoint", async () => withServer(async (url) => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "notification-service" });
}));

test("builds messages for booking, payment, refund and unknown event keys", () => {
    assert.equal(buildMessage("booking.created", { bookingId: 1, totalPrice: 100, deposit: 20 }), "Booking #1 received. Please pay 120 (includes a refundable deposit of 20).");
    assert.match(buildMessage("booking.confirmed", { bookingId: 1 }), /confirmed/);
    assert.match(buildMessage("booking.cancelled", { bookingId: 1 }), /cancelled/);
    assert.match(buildMessage("booking.picked_up", { bookingId: 1 }), /picked up/);
    assert.match(buildMessage("booking.returned", { bookingId: 1, lateFee: 0 }), /on time/);
    assert.equal(buildMessage("booking.returned", { bookingId: 7, lateFee: 75, lateDays: 2 }), "Booking #7: vehicle returned 2 day(s) late. Late fee: 75.");
    assert.equal(buildMessage("payment.completed", { bookingId: 3, amount: 125 }), "Payment of 125 received for booking #3.");
    assert.match(buildMessage("payment.failed", { bookingId: 1, reason: "declined" }), /declined/);
    assert.match(buildMessage("payment.refunded", { bookingId: 1, refundAmount: 20, reason: "cancelled" }), /Refund of 20/);
    assert.equal(buildMessage("unknown.event", { bookingId: 1 }), "Update for booking #1: unknown.event");
});

test("notification event handler persists event message and recipient", async () => {
    const originalQuery = pool.query;
    const originalLog = console.log;
    let captured;
    pool.query = async (sql, params) => { captured = { sql, params }; return { rows: [], rowCount: 1 }; };
    console.log = () => {};
    try {
        await handleNotificationEvent("payment.completed", { bookingId: 7, customerEmail: "a@test.com", amount: 125 });
        assert.match(captured.sql, /INSERT INTO notifications/);
        assert.deepEqual(captured.params, ["payment.completed", 7, "a@test.com", "Payment of 125 received for booking #7."]);
    } finally { pool.query = originalQuery; console.log = originalLog; }
});

test("notification handler uses unknown and null defaults when event fields are absent", async () => {
    const originalQuery = pool.query;
    const originalLog = console.log;
    let params;
    pool.query = async (_sql, values) => { params = values; return { rows: [], rowCount: 1 }; };
    console.log = () => {};
    try {
        await handleNotificationEvent("booking.created", { totalPrice: 40, deposit: 10 });
        assert.deepEqual(params, ["booking.created", null, "unknown", "Booking #undefined received. Please pay 50 (includes a refundable deposit of 10)."]);
    } finally { pool.query = originalQuery; console.log = originalLog; }
});

test("notification listing filters by booking id and maps database columns", async () => {
    const original = pool.query;
    let params;
    pool.query = async (_sql, values) => {
        params = values;
        return { rows: [{ id: 1, event: "booking.created", booking_id: 5, recipient: "a@test.com", message: "hello", created_at: "2026-01-01" }] };
    };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/notifications?bookingId=5`);
            assert.equal(response.status, 200);
            assert.deepEqual(params, [5]);
            assert.deepEqual((await response.json())[0], { id: 1, event: "booking.created", bookingId: 5, recipient: "a@test.com", message: "hello", sentAt: "2026-01-01" });
        });
    } finally { pool.query = original; }
});

test("notification listing returns unfiltered rows and empty results", async () => {
    const original = pool.query;
    let params;
    pool.query = async (_sql, values) => { params = values; return { rows: [] }; };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/notifications`);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), []);
            assert.deepEqual(params, []);
        });
    } finally { pool.query = original; }
});
