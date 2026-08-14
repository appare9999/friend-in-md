import { EventEmitter } from "node:events";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { LockStore } from "./lib/lockStore.js";
import { Watcher } from "./lib/watcher.js";
import type { AppContext } from "./context.js";
import type { RootStatus, ServerEvent } from "../shared/types.js";
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

  status(): RootStatus {
    return { root: this.ctx?.root ?? null };
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
  }
}
