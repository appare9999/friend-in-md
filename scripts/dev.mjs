// Starts the dev API server and the Vite client as a pair bound to the same
// API port, so several `npm run dev` instances can run side by side without
// their clients all proxying to the first instance's server.
import { spawn } from "node:child_process";
import net from "node:net";

const START_PORT = 4317;
const MAX_ATTEMPTS = 50;

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function findFreePort() {
  for (let port = START_PORT; port < START_PORT + MAX_ATTEMPTS; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in ${START_PORT}-${START_PORT + MAX_ATTEMPTS - 1}`);
}

const apiPort = await findFreePort();
console.log(`[dev] API server port: ${apiPort}`);

const env = { ...process.env, FRIEND_IN_MD_API_PORT: String(apiPort) };
const children = [
  spawn("npx", ["tsx", "watch", "src/server/index.ts", "--dev", "--port", String(apiPort)], {
    stdio: "inherit",
    env,
  }),
  spawn("npx", ["vite"], { stdio: "inherit", env }),
];

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
