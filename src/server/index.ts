import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import open from "open";

import { createServer } from "./app.js";
import { log } from "./lib/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must match vite.config.ts's `server.port` — in --dev mode the fastify
// server skips serving dist-client (it doesn't exist yet), so the tray's
// quick-note popup has to point at Vite's dev server instead.
const VITE_DEV_URL = "http://localhost:5180";

interface CliOptions {
  dir: string | null;
  port: number;
  open: boolean;
  dev: boolean;
  verbose: boolean;
  tray: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dir: null, port: 4317, open: true, dev: false, verbose: false, tray: true };
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
    } else if (arg === "--no-tray") {
      opts.tray = false;
    } else {
      positional.push(arg);
    }
  }

  if (positional[0]) opts.dir = path.resolve(process.cwd(), positional[0]);
  return opts;
}

async function waitForUrl(url: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

async function launchTray(rendererUrl: string): Promise<ChildProcess | null> {
  const trayEntry = path.resolve(__dirname, "../../dist-electron/trayMain.js");
  if (!existsSync(trayEntry)) {
    log(`ℹ️ Tray unavailable — run "npm run build:electron" first, or pass --no-tray to hide this message`);
    return null;
  }

  let electronPath: string;
  try {
    electronPath = (await import("electron")).default as unknown as string;
  } catch {
    log(`ℹ️ Tray unavailable — the "electron" package isn't installed`);
    return null;
  }

  const child = spawn(electronPath, [trayEntry], {
    env: { ...process.env, FRIEND_IN_MD_SERVER_URL: rendererUrl },
    stdio: "inherit",
  });
  child.on("error", (err) => log(`⚠️ Could not start the tray: ${(err as Error).message}`));
  return child;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  let server;
  try {
    server = await createServer({
      dir: opts.dir,
      port: opts.port,
      dev: opts.dev,
      verbose: opts.verbose,
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (!opts.verbose) {
    log(`ℹ️ Run with --verbose to see detailed request logs`);
  }

  let trayProcess: ChildProcess | null = null;
  if (opts.tray) {
    const rendererUrl = opts.dev ? VITE_DEV_URL : server.url;
    if (opts.dev) await waitForUrl(rendererUrl);
    trayProcess = await launchTray(rendererUrl);
  }

  if (opts.open && !opts.dev) {
    await open(server.url);
  }

  const shutdown = async () => {
    trayProcess?.kill();
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
