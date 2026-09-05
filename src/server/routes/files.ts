import type { FastifyInstance, FastifyReply } from "fastify";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import { buildFileTree, clampCsvLimitBytes, resolveSafePath } from "../lib/fileTree.js";
import { log } from "../lib/log.js";
import type {
  FileContentResponse,
  FileTreeNode,
  SaveFileRequest,
} from "../../shared/types.js";

function applyLocks(nodes: FileTreeNode[], ctx: AppContext): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.type === "dir") {
      return { ...node, children: applyLocks(node.children ?? [], ctx) };
    }
    return { ...node, locked: ctx.lockStore.get(node.path).locked };
  });
}

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

export function registerFileRoutes(app: FastifyInstance, state: ServerState): void {
  app.get<{ Querystring: { csvLimit?: string } }>("/api/tree", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;
    const maxCsvBytes = clampCsvLimitBytes(req.query.csvLimit);
    const tree = await buildFileTree(ctx.root, maxCsvBytes);
    return { tree: applyLocks(tree, ctx) };
  });

  app.get<{ Querystring: { path?: string; csvLimit?: string } }>("/api/file", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const relPath = req.query.path;
    if (!relPath) return reply.code(400).send({ error: "path query param required" });

    let absPath: string;
    try {
      absPath = resolveSafePath(ctx.root, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    if (path.extname(absPath).toLowerCase() === ".csv") {
      const maxCsvBytes = clampCsvLimitBytes(req.query.csvLimit);
      const stat = await fs.stat(absPath).catch(() => null);
      if (stat && stat.size > maxCsvBytes) {
        return reply.code(413).send({ error: "CSV file is too large to open." });
      }
    }

    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }

    const lock = ctx.lockStore.get(relPath);

    log(`📄 Opened file: ${relPath}`);
    const body: FileContentResponse = { path: relPath, content, lock };
    return body;
  });

  app.put<{ Body: SaveFileRequest }>("/api/file", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const { path: relPath, content } = req.body;
    if (!relPath) return reply.code(400).send({ error: "path required" });

    let absPath: string;
    try {
      absPath = resolveSafePath(ctx.root, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    const lock = ctx.lockStore.get(relPath);
    if (lock.locked) {
      return reply.code(409).send({ error: "File is locked. Unlock it before editing." });
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf-8");
    log(`💾 Saved: ${relPath}`);
    return { ok: true };
  });
}
