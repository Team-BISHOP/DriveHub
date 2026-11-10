import pg from "pg";

// Return NUMERIC columns as JS numbers and DATE columns as "YYYY-MM-DD" strings.
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The database container may still be starting, so retry for a while.
export async function waitForDb(retries = 30): Promise<void> {
    for (let i = 1; i <= retries; i++) {
        try {
            await pool.query("SELECT 1");
            return;
        } catch {
            console.log(`Waiting for database (${i}/${retries})...`);
            await sleep(2000);
        }
    }
    throw new Error("Database not reachable");
}
