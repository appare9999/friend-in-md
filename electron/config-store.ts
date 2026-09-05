import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface PersistedConfig {
  lastRoot: string | null;
  recentRoots: string[];
}

const DEFAULTS: PersistedConfig = { lastRoot: null, recentRoots: [] };
const MAX_RECENTS = 5;

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

export async function loadConfig(): Promise<PersistedConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveConfig(cfg: PersistedConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2), "utf-8");
}

export async function recordOpenedRoot(root: string): Promise<PersistedConfig> {
  const cfg = await loadConfig();
  cfg.lastRoot = root;
  cfg.recentRoots = [root, ...cfg.recentRoots.filter((r) => r !== root)].slice(0, MAX_RECENTS);
  await saveConfig(cfg);
  return cfg;
}
