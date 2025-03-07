//? Libraries
import { Application } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

//? Modules
import { connectdb } from "./sql.ts";
import { generateRandomString } from "./utils.ts";

//? Objects
const app = new Application();
const environment = config();
const port = Number(environment.API_PORT);
let db = await connectdb(environment);

//? CORS
app.use(oakCors({
  origin: "https://www.davidnet.net, https://davidnet.net, https://account.davidnet.net, https://auth.davidnet.net", 
  methods: ["POST"], 
  allowedHeaders: ["Content-Type"], 
  credentials: true,
}));

//? Routes
app.use(async (ctx) => {
  // Root
  if (ctx.request.method === "GET" && ctx.request.url.pathname === "/") {
    ctx.response.body = { message: "usercontent API: Access denied!" };
    return;
  }

  
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
