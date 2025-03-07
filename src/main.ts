import { Application, Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { extname } from "https://deno.land/std@0.203.0/path/mod.ts"; // To check file types
import { connectdb } from "./sql.ts"; // Your DB connection
import { generateRandomString } from "./utils.ts"; // Helper function

const app = new Application();
const environment = config();
const port = Number(environment.API_PORT);
let db = await connectdb(environment);

app.use(oakCors({
    origin: ["https://www.davidnet.net", "https://davidnet.net", "https://account.davidnet.net", "https://auth.davidnet.net"],
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
}));

// File upload route
app.use(async (ctx: Context) => {
    if (
        ctx.request.method === "POST" && ctx.request.url.pathname === "/upload"
    ) {
        const body = await ctx.request.body().value as {
            token?: string;
            type?: string;
            file?: any;
        };

        if (!body.token || !body.type || !body.file) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing token, type, or file" };
            return;
        }

        // Validate session
        const sessionResult = await db.query(
            "SELECT userid FROM sessions WHERE token = ?",
            [body.token],
        );
        if (sessionResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid session token" };
            return;
        }

        const userid = sessionResult[0].userid;
        const currentUTCDate = new Date();
        const created_at = currentUTCDate.toISOString().slice(0, 19).replace(
            "T",
            " ",
        );
        const location = "my_hdd";

        // Ensure the file has a valid extension
        const fileExtension = extname(body.file.filename);
        const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".pdf"]; // Add valid extensions

        if (!validExtensions.includes(fileExtension)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid file type" };
            return;
        }

        const path = `/mnt/my_hdd/uc/${
            generateRandomString(50)
        }_${body.file.filename}`;

        // Save the file to disk
        await Deno.writeFile(path, body.file.content);

        // Insert record into database
        await db.execute(
            `INSERT INTO users(username, password, email, created_at, delete_token, email_token) 
            VALUES(?, ?, ?, ?, ?, ?)`,
            [location, path, body.type, created_at, userid],
        );
        
        ctx.response.body = {
            message: "File uploaded successfully",
            path: path,
        };
    }
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
