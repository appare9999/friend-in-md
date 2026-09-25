import { EventEmitter } from "node:events";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { LockStore } from "./lib/lockStore.js";
import { Watcher } from "./lib/watcher.js";
import { listQuickNotes } from "./lib/quickNote.js";
import { loadQuickNoteFolder, saveQuickNoteFolder } from "./lib/quickNoteSettings.js";
import type { AppContext } from "./context.js";
import type { QuickNoteSummary, RootStatus, ServerEvent } from "../shared/types.js";
import { isWsl, looksLikeWindowsPath, windowsPathToWsl } from "./lib/platform.js";
import { log } from "./lib/log.js";

export async function resolveRootInput(input: string): Promise<string> {
  let candidate = input;

  if (isWsl() && looksLikeWindowsPath(candidate)) {
    const converted = await windowsPathToWsl(candidate);
    if (converted) candidate = converted;
  }

  const expanded =
    candidate === "~" || candidate.startsWith("~/")
      ? path.join(os.homedir(), candidate.slice(1))
      : candidate;
  return path.resolve(expanded);
}

export class ServerState extends EventEmitter {
  ctx: AppContext | null = null;

  // Independent of `ctx`/the open vault root - see quickNoteSettings.ts.
  quickNoteFolder: string | null = null;
  private quickNotesCache: QuickNoteSummary[] | null = null;
  private quickNoteWatcher: Watcher | null = null;

  status(): RootStatus {
    return { root: this.ctx?.root ?? null };
  }

  // Loads the persisted quick-note folder and starts watching it - called
  // once at server startup (see app.ts).
  async initQuickNotes(): Promise<void> {
    this.quickNoteFolder = await loadQuickNoteFolder();
    await this.watchQuickNoteFolder();
  }

  async setQuickNoteFolder(folder: string | null): Promise<void> {
    this.quickNoteFolder = folder;
    this.quickNotesCache = null;
    await saveQuickNoteFolder(folder);
    await this.watchQuickNoteFolder();
  }

  private async watchQuickNoteFolder(): Promise<void> {
    if (this.quickNoteWatcher) {
      await this.quickNoteWatcher.close();
      this.quickNoteWatcher = null;
    }
    if (!this.quickNoteFolder) return;

    const watcher = new Watcher(this.quickNoteFolder);
    watcher.on("event", (event: ServerEvent) => {
      if (event.type === "tree-changed" || event.type === "file-changed") {
        this.quickNotesCache = null;
      }
    });
    this.quickNoteWatcher = watcher;
  }

  // Cached and invalidated by the dedicated watcher above, so repeatedly
  // opening the quick-note popup doesn't re-walk and re-read the whole
  // folder every time - only after something in it actually changes.
  async getQuickNotes(): Promise<QuickNoteSummary[]> {
    if (!this.quickNoteFolder) return [];
    if (this.quickNotesCache) return this.quickNotesCache;
    const notes = await listQuickNotes(this.quickNoteFolder);
    this.quickNotesCache = notes;
    return notes;
  }

  async setRoot(input: string): Promise<RootStatus> {
    const root = await resolveRootInput(input);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new Error(`Not a directory: ${root}`);
    }

    if (this.ctx) {
      await this.ctx.watcher.close();
    }

    const lockStore = await LockStore.load(root);
    const watcher = new Watcher(root);
    watcher.on("event", (event: ServerEvent) => this.emit("event", event));

    this.ctx = { root, lockStore, watcher };

    log(`📁 Opened folder: ${root}`);

    const status = this.status();
    this.emit("event", { type: "root-changed", status } satisfies ServerEvent);
    return status;
  }

  async close(): Promise<void> {
    if (this.ctx) await this.ctx.watcher.close();
    if (this.quickNoteWatcher) await this.quickNoteWatcher.close();
  }
}
