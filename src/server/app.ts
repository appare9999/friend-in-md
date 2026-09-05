import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { ServerState } from "./state.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerLockRoutes } from "./routes/lock.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRootRoutes } from "./routes/root.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerDiagramRoutes } from "./routes/diagrams.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerReadmeRoutes } from "./routes/readme.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerMarpThemeRoutes } from "./routes/marpTheme.js";
import { registerQuickNoteRoutes } from "./routes/quickNotes.js";
import { log } from "./lib/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CreateServerOptions {
  dir?: string | null;
  port?: number;
  dev?: boolean;
  verbose?: boolean;
}

export interface FriendInMdServer {
  app: FastifyInstance;
  state: ServerState;
  url: string;
  port: number;
  stop(): Promise<void>;
}

async function listenOnFreePort(
  app: FastifyInstance,
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

export async function createServer(opts: CreateServerOptions = {}): Promise<FriendInMdServer> {
  const port = opts.port ?? 4317;
  const dev = opts.dev ?? false;
  const verbose = opts.verbose ?? false;

  const state = new ServerState();

  if (opts.dir) {
    if (!existsSync(opts.dir)) {
      throw new Error(`Directory not found: ${opts.dir}`);
    }
    await state.setRoot(opts.dir);
  }

  // Encoded PlantUML diagrams can run to several hundred/thousand chars -
  // well past find-my-way's default 100-char param limit, which silently
  // 404s the route instead of erroring loudly.
  // The raw pino per-request logger is opt-in via --verbose: end users get
  // the friendly emoji log below instead, which is what matters day to day.
  const app = Fastify({ logger: verbose, maxParamLength: 20000 });

  if (dev) {
    await app.register(fastifyCors, { origin: true });
  }

  registerRootRoutes(app, state);
  registerFileRoutes(app, state);
  registerLockRoutes(app, state);
  registerSearchRoutes(app, state);
  registerDiagramRoutes(app);
  registerAssetRoutes(app, state);
  registerReadmeRoutes(app);
  registerExportRoutes(app, state);
  registerMarpThemeRoutes(app, state);
  registerQuickNoteRoutes(app, state);
  registerEventRoutes(app, state);

  const clientDist = path.resolve(__dirname, "../../dist-client");
  if (!dev && existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  const actualPort = await listenOnFreePort(app, port);
  const url = `http://127.0.0.1:${actualPort}`;
  log(`🚀 You've got a friend in md is running at ${url}`);
  if (!state.ctx) {
    log(`📁 No folder selected yet — pick one in the browser`);
  }

  const stop = async () => {
    await state.close();
    await app.close();
  };

  return { app, state, url, port: actualPort, stop };
}
