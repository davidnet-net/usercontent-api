import { Application, Context, Router } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { extname } from "https://deno.land/std@0.203.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.203.0/fs/mod.ts";
import { connectdb } from "./sql.ts";
import { generateRandomString } from "./utils.ts";

const app = new Application();
const router = new Router();
const environment = config();
const port = Number(environment.API_PORT);
const db = await connectdb(environment);

// CORS Config
app.use(oakCors({
    origin: ["https://www.davidnet.net", "https://davidnet.net", "https://account.davidnet.net", "https://auth.davidnet.net"],
    methods: ["POST", "GET"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
}));

// Zorg dat de upload directory bestaat
const UPLOAD_DIR = "/mnt/my_hdd/uc/";
const BASE_URL = "https://uc.davidnet.net/";
await ensureDir(UPLOAD_DIR);

// ✅ File Upload Route
router.post("/upload", async (ctx: Context) => {
    const body = ctx.request.body({ type: "form-data" });
    const formData = await body.value.read();

    const token = formData.fields.token || null;
    const type = formData.fields.type || null;
    const file = formData.files?.[0] || null;

    if (!token || !type || !file) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token, type, or file." };
        return;
    }

    // ✅ Session Validation
    const sessionResult = await db.query("SELECT userid FROM sessions WHERE token = ?", [token]);
    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }
    const userid = sessionResult[0].userid;

    // ✅ File Type Validation
    const fileExtension = extname(file.originalName ?? "");
    const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".pdf"];
    if (!validExtensions.includes(fileExtension)) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid file type." };
        return;
    }

    // ✅ Save File
    const filename = `${generateRandomString(20)}_${file.originalName ?? "unknown_file"}`;
    const filepath = `${UPLOAD_DIR}${filename}`;
    await Deno.writeFile(filepath, await Deno.readFile(file.filename ?? ""));

    // ✅ Check bestandsgrootte
    const fileInfo = await Deno.stat(filepath);
    if (fileInfo.size > 5 * 1024 * 1024) { // Max 5MB
        await Deno.remove(filepath);
        ctx.response.status = 400;
        ctx.response.body = { error: "File too large." };
        return;
    }

    // ✅ Insert Record into DB
    const dbResult = await db.execute(
        `INSERT INTO uploaded_files (user_id, file_path, file_type, created_at) VALUES (?, ?, ?, ?)`,
        [userid, filepath, type, new Date().toISOString()]
    );
    const contentId = dbResult.lastInsertId;

    ctx.response.body = { message: "File uploaded successfully", id: contentId, url: `${BASE_URL}${filename}` };
});

// ✅ Get Content ID by File URL
router.get("/get_content_id", async (ctx: Context) => {
    const url = ctx.request.url.searchParams.get("url");
    if (!url) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing file URL." };
        return;
    }

    if (!url.startsWith(BASE_URL)) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid file URL." };
        return;
    }

    const relativePath = url.replace(BASE_URL, UPLOAD_DIR); // Zet URL om naar bestandspad
    const result = await db.query("SELECT id FROM uploaded_files WHERE file_path = ?", [relativePath]);

    if (result.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "File not found." };
        return;
    }

    ctx.response.body = { id: result[0].id };
});

// ✅s Get File Info by ID
router.get("/get_file_info", async (ctx: Context) => {
    const id = ctx.request.url.searchParams.get("id");
    if (!id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing file ID." };
        return;
    }

    const result = await db.query("SELECT file_path, user_id, file_type, created_at FROM uploaded_files WHERE id = ?", [id]);

    if (result.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "File not found." };
        return;
    }

    const { file_path, user_id, file_type, created_at } = result[0];

    try {
        const fileInfo = await Deno.stat(file_path);
        ctx.response.body = {
            id: id,
            user_id: user_id,
            file_type: file_type,
            created_at: created_at,
            file_path: file_path,
            file_url: file_path.replace(UPLOAD_DIR, BASE_URL), // Omzetten naar URL
            size: fileInfo.size,
            modified_at: fileInfo.mtime?.toISOString(),
        };
    } catch (error) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Could not retrieve file info." };
    }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`🚀 Server running at http://localhost:${port}`);
await app.listen({ port });
