import path from "node:path";
import open from "open";

import { createServer } from "./app.js";
import { log } from "./lib/log.js";

interface CliOptions {
  dir: string | null;
  port: number | undefined;
  open: boolean;
  dev: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dir: null, port: undefined, open: true, dev: false, verbose: false };
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

  if (opts.open && !opts.dev) {
    await open(server.url);
  }

  const shutdown = async () => {
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
