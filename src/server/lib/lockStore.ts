import { promises as fs } from "node:fs";
import path from "node:path";
import type { LockEntry, LockState } from "../../shared/types.js";

const STATE_DIR = ".friend-in-md";
const STATE_FILE = "state.json";

// Files are locked (read-only) by default; unlocking is an explicit action.
const DEFAULT_LOCK: LockEntry = { locked: true, lockedAt: null };

export class LockStore {
  private readonly statePath: string;
  private state: LockState = {};
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(statePath: string, state: LockState) {
    this.statePath = statePath;
    this.state = state;
  }

  static async load(root: string): Promise<LockStore> {
    const stateDir = path.join(root, STATE_DIR);
    const statePath = path.join(stateDir, STATE_FILE);
    await fs.mkdir(stateDir, { recursive: true });
    await ensureGitignored(root);

    let state: LockState = {};
    try {
      const raw = await fs.readFile(statePath, "utf-8");
      state = JSON.parse(raw) as LockState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return new LockStore(statePath, state);
  }

  get(relPath: string): LockEntry {
    return this.state[relPath] ?? DEFAULT_LOCK;
  }

  async lock(relPath: string): Promise<LockEntry> {
    const entry: LockEntry = { locked: true, lockedAt: new Date().toISOString() };
    this.state[relPath] = entry;
    await this.persist();
    return entry;
  }

  async unlock(relPath: string): Promise<LockEntry> {
    const entry: LockEntry = { locked: false, lockedAt: new Date().toISOString() };
    this.state[relPath] = entry;
    await this.persist();
    return entry;
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmpPath = `${this.statePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
      await fs.rename(tmpPath, this.statePath);
    });
    return this.writeQueue;
  }
}

async function ensureGitignored(root: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  const entry = `${STATE_DIR}/`;
  let content = "";
  try {
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const lines = content.split("\n").map((l) => l.trim());
  if (lines.includes(entry) || lines.includes(STATE_DIR)) return;
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await fs.writeFile(gitignorePath, `${content}${prefix}${entry}\n`, "utf-8");
}
