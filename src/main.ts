import {
    Application,
    Context,
    Router,
} from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { extname } from "https://deno.land/std@0.203.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.203.0/fs/mod.ts";
import { connectdb } from "./sql.ts";
import { addaccountlog, generateRandomString } from "./utils.ts";

const app = new Application();
const router = new Router();
const environment = config();
const port = Number(environment.API_PORT);
const db = await connectdb(environment);

// CORS Config
app.use(oakCors({
    origin: "https://account.davidnet.net",
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
    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [token],
    );
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
    const filename = `${generateRandomString(20)}_${
        file.originalName ?? "unknown_file"
    }`;
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

    const currentUTCDate = new Date();
    const created_at = currentUTCDate.toISOString().slice(0, 19)
        .replace("T", " ");

    // ✅ Insert Record into DB
    const dbResult = await db.execute(
        `INSERT INTO usercontent (userid, path, type, created_at) VALUES (?, ?, ?, ?)`,
        [userid, filepath, type, created_at],
    );
    const contentId = dbResult.lastInsertId;

    addaccountlog(db, userid, "Usercontent", "Uploaded " + filepath.slice(45) + ".");

    ctx.response.body = {
        message: "File uploaded successfully",
        id: contentId,
        url: `${BASE_URL}${filename}`,
    };
});

// ✅ Get Content ID by File URL
router.post("/get_content_id", async (ctx: Context) => {
    const body = await ctx.request.body().value as {
        url?: string;
    };

    if (!body.url) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing url" };
        return;
    }

    if (!body.url.startsWith(BASE_URL)) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid file URL." };
        return;
    }

    const relativePath = body.url.replace(BASE_URL, UPLOAD_DIR); // Zet URL om naar bestandspad
    const result = await db.query(
        "SELECT id FROM uploaded_files WHERE file_path = ?",
        [relativePath],
    );

    if (result.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "File not found." };
        return;
    }

    ctx.response.body = { id: result[0].id };
});

// ✅s Get File Info by ID
router.post("/get_file_info", async (ctx: Context) => {
    const body = await ctx.request.body().value as {
        id?: string;
    };

    if (!body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing id" };
        return;
    }

    const result = await db.query(
        "SELECT file_path, user_id, file_type, created_at FROM uploaded_files WHERE id = ?",
        [body.id],
    );

    if (result.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "File not found." };
        return;
    }

    const { file_path, user_id, file_type, created_at } = result[0];

    try {
        const fileInfo = await Deno.stat(file_path);
        ctx.response.body = {
            id: body.id,
            user_id: user_id,
            file_type: file_type,
            created_at: created_at,
            file_path: file_path,
            file_url: file_path.replace(UPLOAD_DIR, BASE_URL), // Omzetten naar URL
            size: fileInfo.size,
            modified_at: fileInfo.mtime?.toISOString(),
        };
    } catch (_error) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Could not retrieve file info." };
    }
});

// ✅ Get User Uploads by Session Token
router.post("/get_user_uploads", async (ctx: Context) => {
    const body = await ctx.request.body().value as {
        token?: string;
    };

    // Check if token is provided
    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    // Validate session token and get user ID
    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }

    const userId = sessionResult[0].userid;

    // Query to get all uploads for the user
    const uploads = await db.query(
        "SELECT id, path, type, created_at FROM usercontent WHERE userid = ?",
        [userId],
    );

    // If no uploads are found, return a 404
    if (uploads.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "No uploads found for this user." };
        return;
    }

    // Return the uploads as JSON
    // deno-lint-ignore no-explicit-any
    ctx.response.body = uploads.map((upload: any) => ({
        id: upload.id,
        url: `${BASE_URL}${upload.path.split("/").pop()}`, // Generate URL from file path
        type: upload.type,
        created_at: upload.created_at,
    }));
});

// ✅ Delete Content Route
router.post("/delete_content", async (ctx: Context) => {
    const body = await ctx.request.body().value as {
        token?: string;
        id?: string;
    };

    if (!body.token || !body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token or id" };
        return;
    }

    // ✅ Validate session token and get user ID
    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }

    const userId = sessionResult[0].userid;

    // ✅ Check if the user is the owner of the content
    const contentResult = await db.query(
        "SELECT userid, path FROM usercontent WHERE id = ?",
        [body.id],
    );

    if (contentResult.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Content not found." };
        return;
    }

    const content = contentResult[0];
    if (content.userid !== userId) {
        ctx.response.status = 403;
        ctx.response.body = { error: "You are not the owner of this content." };
        return;
    }

    // ✅ Delete the file from disk
    try {
        await Deno.remove(content.path);
    } catch (_error) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Error deleting file from disk." };
        return;
    }

    // ✅ Delete the record from the database
    await db.execute("DELETE FROM usercontent WHERE id = ?", [body.id]);

    addaccountlog(db, userId, "Usercontent", "Deleted " + content.path.slice(45) + ".");
    ctx.response.body = { message: "Content deleted successfully." };
});

router.post("/delete_all_content", async (ctx: Context) => {
    const body = await ctx.request.body().value as { token?: string };

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    // ✅ Haal user ID op via sessie token
    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }

    const userId = sessionResult[0].userid;

    // ✅ Haal alle content op die bij de gebruiker hoort
    const contentResult = await db.query(
        "SELECT id, path FROM usercontent WHERE userid = ?",
        [userId],
    );

    if (contentResult.length === 0) {
        ctx.response.body = { message: "No content to delete." };
        return;
    }

    // ✅ Verwijder elk bestand van de schijf
    let deletedFiles = 0;
    for (const content of contentResult) {
        try {
            await Deno.remove(content.path);
            deletedFiles++;
        } catch (_error) { 
            console.warn(`Failed to delete file: ${content.path}`);
        }
    }

    // ✅ Verwijder alle database records van deze gebruiker
    await db.execute("DELETE FROM usercontent WHERE userid = ?", [userId]);

    addaccountlog(db, userId, "Usercontent", `Deleted all usercontent.`);

    ctx.response.body = {
        message: `Deleted ${deletedFiles} file(s) and database records.`,
    };
});

app.use(async (ctx, next) => {
    console.log(`Incoming request: ${ctx.request.method} ${ctx.request.url}`);
    await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`🚀 Server running at http://localhost:${port}`);
await app.listen({ port });
