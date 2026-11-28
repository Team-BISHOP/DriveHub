import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
createRequire(new URL("../../services/fleet-service/package.json", import.meta.url))("tsx/esm/api").register();
const { app } = await import("../../services/fleet-service/src/index.ts");
const { pool } = await import("../../services/fleet-service/src/db.ts");

async function withServer(run) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const vehicle = { make: "Toyota", model: "Corolla", year: 2026, category: "CAR", plate: "ABC123", dailyRate: 55 };
const vehicleRow = { id: 1, ...vehicle, daily_rate: 55, image_url: null, status: "AVAILABLE" };
const json = (body, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("health endpoint", async () => withServer(async (url) => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "fleet-service" });
}));

test("vehicle create validates all field constraints", async () => withServer(async (url) => {
    for (const body of [
        { ...vehicle, make: "" }, { ...vehicle, model: "" }, { ...vehicle, year: 1989 },
        { ...vehicle, year: 2101 }, { ...vehicle, year: 2025.5 }, { ...vehicle, category: "" },
        { ...vehicle, plate: "" }, { ...vehicle, dailyRate: 0 },
    ]) assert.equal((await fetch(`${url}/vehicles`, json(body))).status, 400);
}));

test("creates vehicle and maps database columns to API shape", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [vehicleRow], rowCount: 1 });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/vehicles`, json(vehicle));
            assert.equal(response.status, 201);
            assert.deepEqual(await response.json(), { id: 1, make: "Toyota", model: "Corolla", year: 2026, category: "CAR", plate: "ABC123", dailyRate: 55, imageUrl: null, status: "AVAILABLE" });
        });
    } finally { pool.query = original; }
});

test("duplicate plate returns conflict", async () => {
    const original = pool.query;
    pool.query = async () => { const error = new Error("duplicate"); error.code = "23505"; throw error; };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/vehicles`, json(vehicle));
            assert.equal(response.status, 409);
            assert.deepEqual(await response.json(), { error: "A vehicle with this plate already exists" });
        });
    } finally { pool.query = original; }
});

test("listing supports no filters, status, category, and combined case-insensitive filters", async () => {
    const original = pool.query;
    const calls = [];
    pool.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [vehicleRow], rowCount: 1 }; };
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/vehicles`)).status, 200);
            assert.deepEqual(calls[0].params, []);
            await fetch(`${url}/vehicles?status=available`);
            assert.deepEqual(calls[1].params, ["AVAILABLE"]);
            await fetch(`${url}/vehicles?category=suv`);
            assert.deepEqual(calls[2].params, ["SUV"]);
            await fetch(`${url}/vehicles?status=maintenance&category=van`);
            assert.deepEqual(calls[3].params, ["MAINTENANCE", "VAN"]);
        });
    } finally { pool.query = original; }
});

test("get vehicle maps row and returns 404 for missing ids", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => params[0] === 1 ? { rows: [vehicleRow], rowCount: 1 } : { rows: [], rowCount: 0 };
    try {
        await withServer(async (url) => {
            const found = await fetch(`${url}/vehicles/1`);
            assert.equal(found.status, 200);
            assert.equal((await found.json()).dailyRate, 55);
            assert.equal((await fetch(`${url}/vehicles/2`)).status, 404);
            assert.equal((await fetch(`${url}/vehicles/0`)).status, 400);
        });
    } finally { pool.query = original; }
});

test("partial vehicle update accepts fields and validates supplied fields", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [{ ...vehicleRow, daily_rate: 60 }], rowCount: 1 });
    try {
        await withServer(async (url) => {
            const updated = await fetch(`${url}/vehicles/1`, json({ dailyRate: 60 }, "PUT"));
            assert.equal(updated.status, 200);
            assert.equal((await updated.json()).dailyRate, 60);
            assert.equal((await fetch(`${url}/vehicles/1`, json({ year: 1800 }, "PUT"))).status, 400);
        });
    } finally { pool.query = original; }
});

test("partial update returns 404 when vehicle is missing", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [], rowCount: 0 });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/vehicles/10`, json({ make: "Honda" }, "PUT"));
            assert.equal(response.status, 404);
        });
    } finally { pool.query = original; }
});

test("status update accepts valid statuses and rejects invalid status", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => ({ rows: [{ ...vehicleRow, status: params[1] }], rowCount: 1 });
    try {
        await withServer(async (url) => {
            for (const status of ["AVAILABLE", "MAINTENANCE", "RETIRED"]) {
                const response = await fetch(`${url}/vehicles/1/status`, json({ status }, "PATCH"));
                assert.equal(response.status, 200);
                assert.equal((await response.json()).status, status);
            }
            assert.equal((await fetch(`${url}/vehicles/1/status`, json({ status: "BROKEN" }, "PATCH"))).status, 400);
        });
    } finally { pool.query = original; }
});

test("status update returns 404 for missing vehicle", async () => {
    const original = pool.query;
    pool.query = async () => ({ rows: [], rowCount: 0 });
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/vehicles/1/status`, json({ status: "RETIRED" }, "PATCH"));
            assert.equal(response.status, 404);
            assert.equal((await fetch(`${url}/vehicles/1/status`, json({ status: "BROKEN" }, "PATCH"))).status, 400);
        });
    } finally { pool.query = original; }
});

test("delete returns 204 for found vehicle and 404 for missing vehicle", async () => {
    const original = pool.query;
    pool.query = async (_sql, params) => ({ rowCount: params[0] === 1 ? 1 : 0, rows: [] });
    try {
        await withServer(async (url) => {
            assert.equal((await fetch(`${url}/vehicles/1`, { method: "DELETE" })).status, 204);
            assert.equal((await fetch(`${url}/vehicles/2`, { method: "DELETE" })).status, 404);
            assert.equal((await fetch(`${url}/vehicles/nope`, { method: "DELETE" })).status, 400);
        });
    } finally { pool.query = original; }
});

test("supports imageUrl on create/update and rejects invalid imageUrl", async () => {
    const original = pool.query;
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{ ...vehicleRow, image_url: params[params.length - 1] ?? null }], rowCount: 1 };
    };
    try {
        await withServer(async (url) => {
            const bad = await fetch(`${url}/vehicles`, json({ ...vehicle, imageUrl: "ftp://bad.example/a.png" }));
            assert.equal(bad.status, 400);

            const created = await fetch(`${url}/vehicles`, json({ ...vehicle, imageUrl: "/uploads/test.jpg" }));
            assert.equal(created.status, 201);
            assert.equal((await created.json()).imageUrl, "/uploads/test.jpg");

            const cleared = await fetch(`${url}/vehicles/1`, json({ imageUrl: null }, "PUT"));
            assert.equal(cleared.status, 200);
            assert.equal(calls[1].params[7], true);
            assert.equal(calls[1].params[8], null);
        });
    } finally { pool.query = original; }
});

test("duplicate plate on update returns conflict", async () => {
    const original = pool.query;
    pool.query = async () => { const error = new Error("duplicate"); error.code = "23505"; throw error; };
    try {
        await withServer(async (url) => {
            const response = await fetch(`${url}/vehicles/1`, json({ plate: "DUP-1" }, "PUT"));
            assert.equal(response.status, 409);
        });
    } finally { pool.query = original; }
});

test("upload endpoint stores image and rejects invalid or missing files", async () => {
    let uploadedPath = null;
    try {
        await withServer(async (url) => {
            const emptyRes = await fetch(`${url}/vehicles/upload`, { method: "POST", body: new FormData() });
            assert.equal(emptyRes.status, 400);

            const badForm = new FormData();
            badForm.append("image", new Blob(["hello"], { type: "text/plain" }), "note.txt");
            const badRes = await fetch(`${url}/vehicles/upload`, { method: "POST", body: badForm });
            assert.equal(badRes.status, 400);

            const okForm = new FormData();
            okForm.append("image", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "car.png");
            const okRes = await fetch(`${url}/vehicles/upload`, { method: "POST", body: okForm });
            assert.equal(okRes.status, 201);
            const body = await okRes.json();
            assert.match(body.imageUrl, /^\/uploads\/.+\.png$/);
            uploadedPath = path.join(process.cwd(), "services", "fleet-service", body.imageUrl.replace(/^\//, ""));

            const fetched = await fetch(`${url}${body.imageUrl}`);
            assert.equal(fetched.status, 200);
        });
    } finally {
        if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    }
});
