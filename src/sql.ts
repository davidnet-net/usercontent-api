import { DotenvConfig } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

export async function connectdb(enviroment: DotenvConfig) {
    const db = await new Client().connect({
        hostname: enviroment.DB_HOST,
        username: enviroment.DB_USER,
        db: enviroment.DB_NAME,
        password: enviroment.DB_PASSWORD,
        port: Number(enviroment.DB_PORT),
    });

    try {
        await db.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
            [enviroment.DB_NAME],
        );
    } catch (error) {
        console.error("Error: Initial database connection failed!");
        console.error(error);
        Deno.exit(1);
    }
    console.log("OK: Database connected!");
    return db;
}
