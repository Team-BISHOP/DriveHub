import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { pool, waitForDb } from "./db";

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(express.json());

// Interactive API docs at /docs, loaded from openapi.yaml
const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

// ---------- validation ----------
const STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"] as const;

const vehicleSchema = z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int().min(1990).max(2100),
    category: z.string().min(1), // e.g. CAR, SUV, VAN, BIKE
    plate: z.string().min(1),
    dailyRate: z.number().positive(),
});

const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    return id;
};

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Convert a DB row to the JSON shape the API returns
const toVehicle = (r: any) => ({
    id: r.id,
    make: r.make,
    model: r.model,
    year: r.year,
    category: r.category,
    plate: r.plate,
    dailyRate: r.daily_rate,
    status: r.status,
});

// ---------- routes ----------
app.get("/health", (_req, res) => res.json({ status: "ok", service: "fleet-service" }));

// Scenario 3: vendor adds a vehicle
app.post("/vehicles", async (req, res) => {
    const v = vehicleSchema.parse(req.body);
    try {
        const { rows } = await pool.query(
            `INSERT INTO vehicles (make, model, year, category, plate, daily_rate)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [v.make, v.model, v.year, v.category, v.plate, v.dailyRate]
        );
        res.status(201).json(toVehicle(rows[0]));
    } catch (e: any) {
        if (e.code === "23505") throw new HttpError(409, "A vehicle with this plate already exists");
        throw e;
    }
});

// List vehicles, optional filters: ?status=AVAILABLE&category=SUV
app.get("/vehicles", async (req, res) => {
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.status) {
        params.push(String(req.query.status).toUpperCase());
        where.push(`status = $${params.length}`);
    }
    if (req.query.category) {
        params.push(String(req.query.category).toUpperCase());
        where.push(`UPPER(category) = $${params.length}`);
    }
    const sql = `SELECT * FROM vehicles ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id`;
    const { rows } = await pool.query(sql, params);
    res.json(rows.map(toVehicle));
});

// Booking service calls this to read price and status
app.get("/vehicles/:id", async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM vehicles WHERE id = $1", [idParam(req)]);
    if (!rows[0]) throw new HttpError(404, "Vehicle not found");
    res.json(toVehicle(rows[0]));
});

// Update vehicle details or price (any subset of fields)
app.put("/vehicles/:id", async (req, res) => {
    const id = idParam(req);
    const v = vehicleSchema.partial().parse(req.body);
    const { rows } = await pool.query(
        `UPDATE vehicles SET
       make = COALESCE($2, make), model = COALESCE($3, model), year = COALESCE($4, year),
       category = COALESCE($5, category), plate = COALESCE($6, plate), daily_rate = COALESCE($7, daily_rate)
     WHERE id = $1 RETURNING *`,
        [id, v.make, v.model, v.year, v.category, v.plate, v.dailyRate]
    );
    if (!rows[0]) throw new HttpError(404, "Vehicle not found");
    res.json(toVehicle(rows[0]));
});

// Enable or block a vehicle (for example, send it to maintenance)
app.patch("/vehicles/:id/status", async (req, res) => {
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const { rows } = await pool.query("UPDATE vehicles SET status = $2 WHERE id = $1 RETURNING *", [idParam(req), status]);
    if (!rows[0]) throw new HttpError(404, "Vehicle not found");
    res.json(toVehicle(rows[0]));
});

app.delete("/vehicles/:id", async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM vehicles WHERE id = $1", [idParam(req)]);
    if (!rowCount) throw new HttpError(404, "Vehicle not found");
    res.status(204).end();
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
    CREATE TABLE IF NOT EXISTS vehicles (
      id          SERIAL PRIMARY KEY,
      make        TEXT NOT NULL,
      model       TEXT NOT NULL,
      year        INT NOT NULL,
      category    TEXT NOT NULL,
      plate       TEXT NOT NULL UNIQUE,
      daily_rate  NUMERIC(10,2) NOT NULL,
      status      TEXT NOT NULL DEFAULT 'AVAILABLE',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    app.listen(PORT, () => console.log(`fleet-service on :${PORT} (docs at /docs)`));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
