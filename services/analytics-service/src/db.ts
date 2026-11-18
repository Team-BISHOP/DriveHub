import pg from "pg";

pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/analyticsdb";

// Auto-create database if not exists (runs on default 'postgres' db first)
async function ensureDatabaseExists(): Promise<void> {
    try {
        const u = new URL(dbUrl);
        const targetDb = u.pathname.replace(/^\//, "");
        if (!targetDb || targetDb === "postgres") return;

        u.pathname = "/postgres";
        const adminPool = new pg.Pool({ connectionString: u.toString() });
        try {
            const check = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
            if (check.rows.length === 0) {
                console.log(`Creating database ${targetDb}...`);
                await adminPool.query(`CREATE DATABASE "${targetDb}"`);
            }
        } finally {
            await adminPool.end().catch(() => {});
        }
    } catch {
        // Ignored if cannot connect or already exists
    }
}

export const pool = new pg.Pool({ connectionString: dbUrl });

export async function waitForDb(retries = 30): Promise<void> {
    await ensureDatabaseExists();

    for (let i = 1; i <= retries; i++) {
        try {
            await pool.query("SELECT 1");
            return;
        } catch {
            console.log(`Waiting for Analytics database (${i}/${retries})...`);
            await sleep(2000);
        }
    }
    throw new Error("Analytics database not reachable");
}
