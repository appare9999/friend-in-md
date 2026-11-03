import type { FastifyInstance, FastifyReply } from "fastify";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import { resolveSafePath } from "../lib/fileTree.js";
import { marpThemeDir } from "../lib/marpThemes.js";
import { log } from "../lib/log.js";

const require = createRequire(import.meta.url);
const marpCliPath = require.resolve("@marp-team/marp-cli/marp-cli.js");

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function registerExportRoutes(app: FastifyInstance, state: ServerState): void {
  app.get<{ Querystring: { path?: string } }>("/api/export/pptx", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const relPath = req.query.path;
    if (!relPath) return reply.code(400).send({ error: "path query param required" });

    let absInput: string;
    try {
      absInput = resolveSafePath(ctx.root, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    if (path.extname(absInput).toLowerCase() !== ".md" && path.extname(absInput).toLowerCase() !== ".markdown") {
      return reply.code(400).send({ error: "Only markdown files can be exported to PowerPoint." });
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "friend-in-md-export-"));
    const absOutput = path.join(tmpDir, "export.pptx");
    const args = [marpCliPath, absInput, "--pptx", "-o", absOutput, "--allow-local-files", "--no-stdin"];
    const themesDir = marpThemeDir(ctx.root);
    if (existsSync(themesDir)) args.push("--theme-set", themesDir);
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          process.execPath,
          args,
          { cwd: ctx.root, timeout: 60_000 },
          (err, _stdout, stderr) => {
            if (err) reject(new Error(stderr.trim() || err.message));
            else resolve();
          }
        );
      });

      const data = await fs.readFile(absOutput);
      const outName = path.basename(absInput).replace(/\.(md|markdown)$/i, ".pptx");
      reply.header("content-type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      reply.header("content-disposition", contentDisposition(outName));
      log(`🎞️ Exported PowerPoint: ${relPath}`);
      return reply.send(data);
    } catch (err) {
      return reply.code(500).send({ error: `PowerPoint export failed: ${(err as Error).message}` });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
