import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Global, not per-vault: the quick-note folder is independent of whichever
// root is currently open (or whether one is open at all), so it lives under
// the user's home directory instead of inside any particular vault.
const CONFIG_DIR = path.join(os.homedir(), ".friend-in-md");
const SETTINGS_FILE = "quick-note-settings.json";

interface QuickNoteSettings {
  folder: string | null;
}

function settingsPath(): string {
  return path.join(CONFIG_DIR, SETTINGS_FILE);
}

export async function loadQuickNoteFolder(): Promise<string | null> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as QuickNoteSettings;
    return parsed.folder ?? null;
  } catch {
    return null;
  }
}

export async function saveQuickNoteFolder(folder: string | null): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const target = settingsPath();
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ folder } satisfies QuickNoteSettings, null, 2), "utf-8");
  await fs.rename(tmp, target);
}
