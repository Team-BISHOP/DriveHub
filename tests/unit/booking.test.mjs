import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
createRequire(new URL("../../services/booking-service/package.json", import.meta.url))("tsx/esm/api").register();
const service = await import("../../services/booking-service/src/index.ts");
const { app } = service;
const { pool } = await import("../../services/booking-service/src/db.ts");

async function withServer(run) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const bookingInput = (overrides = {}) => ({
    vehicleId: 1, customerName: "A", customerEmail: "a@test.com",
    startDate: "2026-05-10", endDate: "2026-05-12", ...overrides,
});
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const row = (overrides = {}) => ({
    id: 1, vehicle_id: 1, customer_name: "A", customer_email: "a@test.com",
    start_date: "2026-05-10", end_date: "2026-05-12", daily_rate: 100,
    total_price: 200, deposit: 40, late_fee: 0, status: "PENDING", ...overrides,
});

test("health endpoint", async () => withServer(async (url) => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "booking-service" });
}));

test("create validates required booking fields and date format", async () => withServer(async (url) => {
    assert.equal((await fetch(`${url}/bookings`, json({ customerEmail: "bad" }))).status, 400);
    assert.equal((await fetch(`${url}/bookings`, json(bookingInput({ startDate: "10-05-2026" })))).status, 400);
}));

test("create rejects end date before start date", async () => withServer(async (url) => {
    const response = await fetch(`${url}/bookings`, json(bookingInput({ endDate: "2026-05-09" })));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "endDate must be on or after startDate" });
}));

test("create maps fleet not-found and unavailable responses", async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : new Response("", { status: 404 });
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`, json(bookingInput()))).status, 404);
        });
        globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Promise.reject(new Error("offline"));
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`, json(bookingInput()))).status, 503);
        });
        globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : new Response("", { status: 500 });
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`, json(bookingInput()))).status, 503);
        });
    } finally { globalThis.fetch = originalFetch; }
});

test("create rejects a vehicle that is not available", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Response.json({ status: "MAINTENANCE", dailyRate: 100 });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/bookings`, json(bookingInput()));
            assert.equal(response.status, 409);
            assert.deepEqual(await response.json(), { error: "Vehicle is MAINTENANCE" });
        });
    } finally { globalThis.fetch = originalFetch; }
});

test("create calculates rental total and deposit, inserts in a transaction, and publishes event", async () => {
    const originalFetch = globalThis.fetch;
    const originalConnect = pool.connect;
    const queries = [];
    let inserted;
    let published;
    service.setPublishForTests((key, payload) => { published = { key, payload }; });
    globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Response.json({ status: "AVAILABLE", dailyRate: 37.55 });
    pool.connect = async () => ({
        query: async (sql, params) => {
            queries.push(sql);
            if (sql.includes("INSERT INTO bookings")) {
                inserted = params;
                return { rows: [row({ total_price: params[6], deposit: params[7] })], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
        release: () => queries.push("RELEASE"),
    });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/bookings`, json(bookingInput()));
            assert.equal(response.status, 201);
            assert.equal(inserted[6], 75.1);
            assert.equal(inserted[7], 15.02);
            assert.deepEqual(queries.slice(0, 3), ["BEGIN", "SELECT pg_advisory_xact_lock($1)", expectSelectOverlap]);
            assert.ok(queries.includes("COMMIT"));
            assert.equal(queries.at(-1), "RELEASE");
            assert.equal(published.key, "booking.created");
            assert.equal(published.payload.totalPrice, 75.1);
        });
    } finally { globalThis.fetch = originalFetch; pool.connect = originalConnect; service.setPublishForTests(() => {}); }
});

const expectSelectOverlap = "SELECT 1 FROM bookings\n       WHERE vehicle_id = $1 AND status IN ('PENDING','CONFIRMED','PICKED_UP')\n         AND start_date <= $3 AND end_date >= $2";

test("same-day rental is charged for one day", async () => {
    const originalFetch = globalThis.fetch;
    const originalConnect = pool.connect;
    let params;
    globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Response.json({ status: "AVAILABLE", dailyRate: 50 });
    pool.connect = async () => ({
        query: async (sql, values) => {
            if (sql.includes("SELECT 1 FROM bookings")) return { rows: [], rowCount: 0 };
            if (sql.includes("INSERT INTO bookings")) params = values;
            return { rows: [row({ total_price: 50, deposit: 10 })], rowCount: 1 };
        },
        release: () => {},
    });
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`, json(bookingInput({ endDate: "2026-05-10" })))).status, 201);
            assert.equal(params[6], 50);
            assert.equal(params[7], 10);
        });
    } finally { globalThis.fetch = originalFetch; pool.connect = originalConnect; }
});

test("overlap conflict rolls back and releases transaction", async () => {
    const originalFetch = globalThis.fetch;
    const originalConnect = pool.connect;
    const queries = [];
    globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Response.json({ status: "AVAILABLE", dailyRate: 100 });
    pool.connect = async () => ({
        query: async (sql) => {
            queries.push(sql);
            return sql.includes("SELECT 1 FROM bookings") ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
        },
        release: () => queries.push("RELEASE"),
    });
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`, json(bookingInput()))).status, 409);
            assert.ok(queries.includes("ROLLBACK"));
            assert.equal(queries.at(-1), "RELEASE");
            assert.equal(queries.some((sql) => sql.includes("INSERT INTO bookings")), false);
        });
    } finally { globalThis.fetch = originalFetch; pool.connect = originalConnect; }
});

test("database insert failure rolls back and returns internal error", async () => {
    const originalFetch = globalThis.fetch;
    const originalConnect = pool.connect;
    const queries = [];
    globalThis.fetch = async (input, init) => String(input).startsWith("http://127.0.0.1") ? originalFetch(input, init) : Response.json({ status: "AVAILABLE", dailyRate: 100 });
    pool.connect = async () => ({
        query: async (sql) => {
            queries.push(sql);
            if (sql.includes("INSERT INTO bookings")) throw new Error("insert failed");
            return { rows: [], rowCount: 0 };
        },
        release: () => queries.push("RELEASE"),
    });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/bookings`, json(bookingInput()));
            assert.equal(response.status, 500);
            assert.ok(queries.includes("ROLLBACK"));
            assert.equal(queries.at(-1), "RELEASE");
        });
    } finally { globalThis.fetch = originalFetch; pool.connect = originalConnect; }
});

test("booking list supports optional uppercased status filter", async () => {
    const original = pool.query;
    let params;
    pool.query = async (_sql, values) => { params = values; return { rows: [row({ status: "CONFIRMED" })] }; };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings`)).status, 200);
            assert.deepEqual(params, []);
            const filtered = await fetch(`${url}/bookings?status=confirmed`);
            assert.equal(filtered.status, 200);
            assert.deepEqual(params, ["CONFIRMED"]);
            assert.equal((await filtered.json())[0].status, "CONFIRMED");
        });
    } finally { pool.query = original; }
});

test("get booking validates id, maps row, and returns 404 when absent", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => params[0] === 1 ? { rows: [row()] } : { rows: [] };
    try {
        await withServer(async (url) => {
            const found = await fetch(`${url}/bookings/1`);
            assert.equal(found.status, 200);
            assert.equal((await found.json()).vehicleId, 1);
            assert.equal((await fetch(`${url}/bookings/invalid`)).status, 400);
            assert.equal((await fetch(`${url}/bookings/99`)).status, 404);
        });
    } finally { pool.query = original; }
});

test("cancel permits pending and confirmed and publishes cancellation", async () => {
    const original = pool.query;
    const events = [];
    let status = "PENDING";
    service.setPublishForTests((key, payload) => events.push({ key, payload }));
    pool.query = async (sql) => sql.startsWith("SELECT")
        ? { rows: [row({ status })] }
        : { rows: [row({ status: "CANCELLED" })] };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/cancel`, { method: "POST" })).status, 200);
            status = "CONFIRMED";
            assert.equal((await fetch(`${url}/bookings/1/cancel`, { method: "POST" })).status, 200);
            assert.deepEqual(events.map((event) => event.key), ["booking.cancelled", "booking.cancelled"]);
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("cancel rejects ineligible status and missing booking", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [row({ status: "PICKED_UP" })] });
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/cancel`, { method: "POST" })).status, 409);
        });
        pool.query = async () => ({ rows: [] });
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/cancel`, { method: "POST" })).status, 404);
        });
    } finally { pool.query = original; }
});

test("pickup requires confirmed status and publishes pickup event", async () => {
    const original = pool.query;
    const events = [];
    let status = "PENDING";
    service.setPublishForTests((key, payload) => events.push({ key, payload }));
    pool.query = async (sql) => sql.startsWith("SELECT")
        ? { rows: [row({ status })] }
        : { rows: [row({ status: "PICKED_UP" })] };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/pickup`, { method: "POST" })).status, 409);
            status = "CONFIRMED";
            assert.equal((await fetch(`${url}/bookings/1/pickup`, { method: "POST" })).status, 200);
            assert.equal(events[0].key, "booking.picked_up");
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("return requires picked-up state and validates return date", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [row({ status: "PENDING" })] });
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/return`, { method: "POST" })).status, 409);
        });
        pool.query = async () => ({ rows: [row({ status: "PICKED_UP" })] });
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/return`, json({ returnDate: "bad" }))).status, 400);
        });
    } finally { pool.query = original; }
});

test("return calculates late fee as daily rate times 1.5 per late day", async () => {
    const original = pool.query;
    const events = [];
    let updateParams;
    service.setPublishForTests((key, payload) => events.push({ key, payload }));
    pool.query = async (sql, params) => {
        if (sql.startsWith("SELECT")) return { rows: [row({ status: "PICKED_UP", daily_rate: 33.33, end_date: "2026-05-10" })] };
        updateParams = params;
        return { rows: [row({ status: "RETURNED" })] };
    };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/bookings/1/return`, json({ returnDate: "2026-05-12" }));
            assert.equal(response.status, 200);
            assert.equal(updateParams[1], 99.99);
            assert.equal(events[0].payload.lateDays, 2);
            assert.equal(events[0].payload.lateFee, 99.99);
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("on-time or early return has no late fee", async () => {
    const original = pool.query;
    let fee;
    service.setPublishForTests((_key, payload) => { fee = payload.lateFee; });
    pool.query = async (sql) => sql.startsWith("SELECT")
        ? { rows: [row({ status: "PICKED_UP", end_date: "2026-05-10" })] }
        : { rows: [row({ status: "RETURNED" })] };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/bookings/1/return`, json({ returnDate: "2026-05-09" }))).status, 200);
            assert.equal(fee, 0);
        });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("payment.completed confirms pending booking and publishes booking.confirmed", async () => {
    const original = pool.query;
    let published;
    service.setPublishForTests((key, payload) => { published = { key, payload }; });
    pool.query = async (_sql, params) => ({ rows: [{ id: params[0], customer_email: "a@test.com" }] });
    try {
        await service.handlePaymentCompleted({ bookingId: 12 });
        assert.deepEqual(published, { key: "booking.confirmed", payload: { bookingId: 12, customerEmail: "a@test.com" } });
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});

test("payment.completed only publishes when a pending booking was updated", async () => {
    const original = pool.query;
    let published = false;
    service.setPublishForTests(() => { published = true; });
    pool.query = async () => ({ rows: [] });
    try {
        await service.handlePaymentCompleted({ bookingId: 12 });
        assert.equal(published, false);
    } finally { pool.query = original; service.setPublishForTests(() => {}); }
});
