import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { LockEntry, LockState } from "../../shared/types.js";

// Lock state lives under the user's home directory, keyed by a hash of the
// root path, so no folder is ever created inside the vault being edited.
const CONFIG_DIR = path.join(os.homedir(), ".friend-in-md", "locks");
const STATE_FILE = "state.json";

// Files are locked (read-only) by default; unlocking is an explicit action.
const DEFAULT_LOCK: LockEntry = { locked: true, lockedAt: null };

function rootKey(root: string): string {
  return crypto.createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
}

export class LockStore {
  private readonly statePath: string;
  private state: LockState = {};
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(statePath: string, state: LockState) {
    this.statePath = statePath;
    this.state = state;
  }

  static async load(root: string): Promise<LockStore> {
    const stateDir = path.join(CONFIG_DIR, rootKey(root));
    const statePath = path.join(stateDir, STATE_FILE);
    await fs.mkdir(stateDir, { recursive: true });

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
