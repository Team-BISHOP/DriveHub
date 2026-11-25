import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
createRequire(new URL("../../services/analytics-service/package.json", import.meta.url))("tsx/esm/api").register();
const analytics = await import("../../services/analytics-service/src/index.ts");
const { app } = analytics;
const { pool } = await import("../../services/analytics-service/src/db.ts");

async function withServer(run) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const originalRemoteOrLocal = (original, responseForRemote) => async (input, init) => {
    const url = String(input);
    return url.startsWith("http://127.0.0.1") ? original(input, init) : responseForRemote(url);
};

test("health aliases", async () => withServer(async (url) => {
    for (const path of ["/health", "/analytics/health"]) {
        const response = await fetch(`${url}${path}`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: "ok", service: "analytics-service" });
    }
}));

test("summary computes financial, booking, rental, and fleet KPIs", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    pool.query = async () => ({ rows: [{ gross_revenue: 1000, total_refunds: 200, late_fees: 50, total_bookings: 10, confirmed_bookings: 8, picked_up_count: 7, returned_count: 5, cancelled_bookings: 2, failed_payments: 1 }] });
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async () => Response.json([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]));
    try {
        await withServer(async (url) => {
            for (const path of ["/summary", "/analytics/summary"]) {
                const response = await fetch(`${url}${path}`);
                assert.equal(response.status, 200);
                assert.deepEqual(await response.json(), {
                    grossRevenue: 1000, totalRefunds: 200, netRevenue: 800, lateFeesCollected: 50,
                    totalBookings: 10, confirmedBookings: 8, activeRentals: 2, completedRentals: 5,
                    cancelledBookings: 2, failedPayments: 1, fleetTotal: 4, fleetUtilization: 50,
                });
            }
        });
    } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

test("summary clamps active rentals and reports zero utilization when fleet endpoints fail", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    let remoteCalls = 0;
    pool.query = async () => ({ rows: [{ picked_up_count: 1, returned_count: 3 }] });
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async () => { remoteCalls++; throw new Error("offline"); });
    try {
        await withServer(async (url) => {
            const body = await (await fetch(`${url}/summary`)).json();
            assert.equal(body.activeRentals, 0);
            assert.equal(body.fleetTotal, 0);
            assert.equal(body.fleetUtilization, 0);
            assert.equal(remoteCalls, 3);
        });
    } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

test("event counters and financial stream aliases return database rows", async () => {
    const originalQuery = pool.query;
    pool.query = async (sql) => sql.includes("GROUP BY event")
        ? { rows: [{ event: "booking.created", count: 3, lastOccurred: "2026-01-01" }] }
        : { rows: [{ id: 1, event: "payment.completed", bookingId: 7, amount: 120 }] };
    try {
        await withServer(async (url) => {
            for (const path of ["/events", "/analytics/events"]) {
                assert.equal((await (await fetch(`${url}${path}`)).json())[0].count, 3);
            }
            for (const path of ["/financial-stream", "/analytics/financial-stream"]) {
                assert.equal((await (await fetch(`${url}${path}`)).json())[0].bookingId, 7);
            }
        });
    } finally { pool.query = originalQuery; }
});

test("database query errors return internal server errors", async () => {
    const originalQuery = pool.query;
    pool.query = async () => { throw new Error("database unavailable"); };
    try {
        await withServer(async (url) => {
            for (const path of ["/analytics/summary", "/analytics/events", "/analytics/financial-stream"]) {
                const response = await fetch(`${url}${path}`);
                assert.equal(response.status, 500);
                assert.deepEqual(await response.json(), { error: "Internal server error" });
            }
        });
    } finally { pool.query = originalQuery; }
});

test("event handler maps event amounts and defaults missing booking/customer fields", async () => {
    const originalQuery = pool.query;
    const inserts = [];
    pool.query = async (_sql, params) => { inserts.push(params); return { rows: [], rowCount: 1 }; };
    try {
        await analytics.handleAnalyticsEvent("payment.completed", { bookingId: 1, customerEmail: "a@test.com", amount: "20.5" });
        await analytics.handleAnalyticsEvent("payment.refunded", { bookingId: 1, refundAmount: 5 });
        await analytics.handleAnalyticsEvent("booking.returned", { lateFee: 3 });
        await analytics.handleAnalyticsEvent("booking.created", {});
        assert.deepEqual(inserts.map((row) => row.slice(0, 4)), [
            ["payment.completed", 1, "a@test.com", 20.5],
            ["payment.refunded", 1, "unknown", 5],
            ["booking.returned", null, "unknown", 3],
            ["booking.created", null, "unknown", 0],
        ]);
        assert.deepEqual(JSON.parse(inserts[0][4]), { bookingId: 1, customerEmail: "a@test.com", amount: "20.5" });
    } finally { pool.query = originalQuery; }
});

test("historical sync skips when remote services or analytics history are absent", async () => {
    const originalFetch = globalThis.fetch;
    const originalQuery = pool.query;
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async () => new Response("{}", { status: 500 }));
    pool.query = async () => ({ rows: [{ count: 0 }] });
    try { assert.equal(await analytics.syncHistoricalData(), 0); }
    finally { globalThis.fetch = originalFetch; pool.query = originalQuery; }
});

test("historical sync imports notification history and resolves financial values", async () => {
    const originalFetch = globalThis.fetch;
    const originalQuery = pool.query;
    const inserted = [];
    const notifications = [
        { event: "payment.completed", bookingId: 1, recipient: "a@test.com" },
        { event: "payment.refunded", bookingId: 2, recipient: "b@test.com" },
        { event: "booking.returned", bookingId: 3, recipient: "c@test.com" },
        { event: "payment.completed", bookingId: 99, recipient: "d@test.com" },
    ];
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async (url) => {
        if (url.endsWith("/bookings")) return Response.json([{ id: 3, lateFee: 17 }]);
        if (url.endsWith("/payments")) return Response.json([{ bookingId: 1, amount: 125 }, { bookingId: 2, refundAmount: 25 }]);
        if (url.endsWith("/notifications")) return Response.json(notifications);
        throw new Error(`Unexpected URL: ${url}`);
    });
    pool.query = async (sql, params) => {
        if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }] };
        inserted.push(params);
        return { rows: [], rowCount: 1 };
    };
    try {
        assert.equal(await analytics.syncHistoricalData(), 4);
        assert.deepEqual(inserted.map((row) => row[3]), [125, 25, 17, 0]);
        assert.equal(inserted[0][2], "a@test.com");
    } finally { globalThis.fetch = originalFetch; pool.query = originalQuery; }
});

test("historical sync backfills booking states and eligible payments", async () => {
    const originalFetch = globalThis.fetch;
    const originalQuery = pool.query;
    const inserted = [];
    const bookings = [
        { id: 1, customerEmail: "a@test.com", totalPrice: 100, status: "PENDING" },
        { id: 2, customerEmail: "b@test.com", totalPrice: 200, status: "CONFIRMED" },
        { id: 3, customerEmail: "c@test.com", totalPrice: 300, lateFee: 10, status: "PICKED_UP" },
        { id: 4, customerEmail: "d@test.com", totalPrice: 400, lateFee: 15, status: "RETURNED" },
        { id: 5, customerEmail: "e@test.com", totalPrice: 500, status: "CANCELLED" },
    ];
    const payments = [
        { bookingId: 1, customerEmail: "a@test.com", amount: 110, refundAmount: 0, status: "PAID" },
        { bookingId: 2, customerEmail: "b@test.com", amount: 220, refundAmount: 20, status: "DEPOSIT_RETURNED" },
        { bookingId: 3, customerEmail: "c@test.com", amount: 330, refundAmount: 30, status: "REFUNDED" },
        { bookingId: 4, customerEmail: "d@test.com", amount: 440, refundAmount: 0, status: "PENDING" },
    ];
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async (url) => {
        if (url.endsWith("/bookings")) return Response.json(bookings);
        if (url.endsWith("/payments")) return Response.json(payments);
        if (url.endsWith("/notifications")) return Response.json([]);
        throw new Error(`Unexpected URL: ${url}`);
    });
    pool.query = async (sql, params) => {
        if (sql.includes("COUNT(*)")) return { rows: [{ count: 0 }] };
        inserted.push(params);
        return { rows: [], rowCount: 1 };
    };
    try {
        assert.equal(await analytics.syncHistoricalData(), 17);
        const names = inserted.map((row) => row[0]);
        assert.equal(names.filter((name) => name === "booking.created").length, 5);
        assert.equal(names.filter((name) => name === "booking.confirmed").length, 3);
        assert.equal(names.filter((name) => name === "booking.picked_up").length, 2);
        assert.equal(names.filter((name) => name === "booking.returned").length, 1);
        assert.equal(names.filter((name) => name === "booking.cancelled").length, 1);
        assert.equal(names.filter((name) => name === "payment.completed").length, 3);
        assert.equal(names.filter((name) => name === "payment.refunded").length, 2);
    } finally { globalThis.fetch = originalFetch; pool.query = originalQuery; }
});

test("historical sync skips insertion if analytics already contains events", async () => {
    const originalFetch = globalThis.fetch;
    const originalQuery = pool.query;
    let insertCount = 0;
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async (url) => url.endsWith("/bookings") ? Response.json([{ id: 1 }]) : Response.json([]));
    pool.query = async (sql) => {
        if (sql.includes("COUNT(*)")) return { rows: [{ count: 10 }] };
        insertCount++;
        return { rows: [], rowCount: 1 };
    };
    try {
        assert.equal(await analytics.syncHistoricalData(), 0);
        assert.equal(insertCount, 0);
    } finally { globalThis.fetch = originalFetch; pool.query = originalQuery; }
});

test("historical sync reports zero on database failure", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async (url) => {
        if (url.endsWith("/bookings") || url.endsWith("/payments") || url.endsWith("/notifications")) return Response.json([]);
        throw new Error(`Unexpected URL: ${url}`);
    });
    pool.query = async () => { throw new Error("database unavailable"); };
    console.error = () => {};
    try { assert.equal(await analytics.syncHistoricalData(), 0); }
    finally { pool.query = originalQuery; globalThis.fetch = originalFetch; console.error = originalError; }
});

test("manual sync endpoint returns number of imported records", async () => {
    const originalFetch = globalThis.fetch;
    const originalQuery = pool.query;
    globalThis.fetch = originalRemoteOrLocal(originalFetch, async (url) => {
        if (url.endsWith("/bookings") || url.endsWith("/payments") || url.endsWith("/notifications")) return Response.json([]);
        throw new Error(`Unexpected URL: ${url}`);
    });
    pool.query = async () => ({ rows: [{ count: 0 }] });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/analytics/sync`, { method: "POST" });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { synced: 0 });
        });
    } finally { globalThis.fetch = originalFetch; pool.query = originalQuery; }
});
