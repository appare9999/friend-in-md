import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import open from "open";

import { ServerState } from "./state.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerLockRoutes } from "./routes/lock.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRootRoutes } from "./routes/root.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerDiagramRoutes } from "./routes/diagrams.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerReadmeRoutes } from "./routes/readme.js";
import { log } from "./lib/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CliOptions {
  dir: string | null;
  port: number;
  open: boolean;
  dev: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dir: null, port: 4317, open: true, dev: false, verbose: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      opts.port = Number(argv[++i]);
    } else if (arg === "--no-open") {
      opts.open = false;
    } else if (arg === "--dev") {
      opts.dev = true;
    } else if (arg === "--verbose") {
      opts.verbose = true;
    } else {
      positional.push(arg);
    }
  }

  if (positional[0]) opts.dir = path.resolve(process.cwd(), positional[0]);
  return opts;
}

async function listenOnFreePort(
  app: ReturnType<typeof Fastify>,
  startPort: number,
  maxAttempts = 20
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    try {
      await app.listen({ port, host: "127.0.0.1" });
      return port;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" || attempt === maxAttempts - 1) throw err;
      log(`⚠️ Port ${port} is in use, trying ${port + 1}…`);
    }
  }
  throw new Error("unreachable");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const state = new ServerState();

  if (opts.dir) {
    if (!existsSync(opts.dir)) {
      console.error(`Directory not found: ${opts.dir}`);
      process.exit(1);
    }
    await state.setRoot(opts.dir);
  }

  // Encoded PlantUML diagrams can run to several hundred/thousand chars -
  // well past find-my-way's default 100-char param limit, which silently
  // 404s the route instead of erroring loudly.
  // The raw pino per-request logger is opt-in via --verbose: end users get
  // the friendly emoji log below instead, which is what matters day to day.
  const app = Fastify({ logger: opts.verbose, maxParamLength: 20000 });

  if (opts.dev) {
    await app.register(fastifyCors, { origin: true });
  }

  registerRootRoutes(app, state);
  registerFileRoutes(app, state);
  registerLockRoutes(app, state);
  registerSearchRoutes(app, state);
  registerDiagramRoutes(app);
  registerAssetRoutes(app, state);
  registerReadmeRoutes(app);
  registerEventRoutes(app, state);

  const clientDist = path.resolve(__dirname, "../../dist-client");
  if (!opts.dev && existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  const actualPort = await listenOnFreePort(app, opts.port);
  const url = `http://127.0.0.1:${actualPort}`;
  log(`🚀 You've got a friend in md is running at ${url}`);
  if (!state.ctx) {
    log(`📁 No folder selected yet — pick one in the browser`);
  }
  if (!opts.verbose) {
    log(`ℹ️ Run with --verbose to see detailed request logs`);
  }

  if (opts.open && !opts.dev) {
    await open(url);
  }

  const shutdown = async () => {
    await state.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
