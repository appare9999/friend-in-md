import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Remembers the last port we successfully bound to, so a fresh launch tries
// that port first instead of always starting from the hardcoded default.
const CONFIG_DIR = path.join(os.homedir(), ".friend-in-md");
const PORT_FILE = "last-port.json";

function portFilePath(): string {
  return path.join(CONFIG_DIR, PORT_FILE);
}

export async function loadLastPort(): Promise<number | null> {
  try {
    const raw = await fs.readFile(portFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as { port?: number };
    return typeof parsed.port === "number" ? parsed.port : null;
  } catch {
    return null;
  }
}

export async function saveLastPort(port: number): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const target = portFilePath();
  // Per-process temp name: several instances can start at once (e.g. `tsx
  // watch` restarting every dev server together) and must not rename each
  // other's temp file away.
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ port }, null, 2), "utf-8");
  await fs.rename(tmp, target);
}
