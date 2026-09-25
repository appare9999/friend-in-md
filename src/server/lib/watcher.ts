import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import type { Stats } from "node:fs";
import { EventEmitter } from "node:events";
import type { ServerEvent } from "../../shared/types.js";
import { fileKindFor } from "./fileTree.js";

export class Watcher extends EventEmitter {
  private readonly fsWatcher: FSWatcher;

  constructor(private readonly root: string) {
    super();
    this.fsWatcher = chokidar.watch(root, {
      // chokidar 3 passes fs.Stats as a second argument at runtime, but its
      // typings only declare the path parameter.
      ignored: ((p: string, stats?: Stats) => {
        const rel = path.relative(root, p);
        if (!rel || rel.startsWith("..")) return false;
        if (
          rel.split(path.sep).some((seg) => [".git", ".friend-in-md", "node_modules"].includes(seg))
        ) {
          return true;
        }
        // chokidar holds one inotify watch per watched file, so watching every
        // file under a big root (venvs, build output...) can exhaust the
        // system-wide inotify limit and silently drop change events. Only the
        // file kinds the app displays are worth watching.
        return !!stats?.isFile() && !fileKindFor(path.extname(p).toLowerCase());
      }) as (p: string) => boolean,
      ignoreInitial: true,
      ignorePermissionErrors: true,
    });

    this.fsWatcher
      .on("add", (p) => {
        this.handle(p, "tree");
        // Atomic saves (write to a temp file, then rename over the target -
        // common for editors and for tools like Claude Code) surface to
        // chokidar as unlink+add rather than a plain "change", so an
        // existing file reappearing here needs to trigger a content
        // refresh too, not just a tree refresh.
        this.handle(p, "file");
      })
      .on("unlink", (p) => this.handle(p, "tree"))
      .on("addDir", () => this.emitEvent({ type: "tree-changed" }))
      .on("unlinkDir", () => this.emitEvent({ type: "tree-changed" }))
      .on("change", (p) => this.handle(p, "file"))
      .on("error", (err) => {
        console.warn(`[friend-in-md] watcher error: ${(err as Error).message}`);
      });
  }

  private handle(absPath: string, kind: "tree" | "file"): void {
    if (kind === "file" && !fileKindFor(path.extname(absPath).toLowerCase())) return;
    const relPath = path.relative(this.root, absPath).split(path.sep).join("/");
    if (kind === "tree") {
      this.emitEvent({ type: "tree-changed" });
    } else {
      this.emitEvent({ type: "file-changed", path: relPath });
    }
  }

  private emitEvent(event: ServerEvent): void {
    this.emit("event", event);
  }

  async close(): Promise<void> {
    await this.fsWatcher.close();
  }
}
