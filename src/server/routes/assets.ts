import type { FastifyInstance, FastifyReply } from "fastify";
import { promises as fs } from "node:fs";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import { browseAssets, resolveSafeImagePath } from "../lib/assets.js";

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

export function registerAssetRoutes(app: FastifyInstance, state: ServerState): void {
  app.get<{ Querystring: { path?: string } }>("/api/assets", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;
    try {
      return await browseAssets(ctx.root, req.query.path ?? "");
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get<{ Querystring: { path?: string } }>("/api/asset", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const relPath = req.query.path;
    if (!relPath) return reply.code(400).send({ error: "path query param required" });

    let abs: string;
    let mime: string;
    try {
      ({ abs, mime } = resolveSafeImagePath(ctx.root, relPath));
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    let data: Buffer;
    try {
      data = await fs.readFile(abs);
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }

    reply.header("content-type", mime);
    reply.header("cache-control", "no-cache");
    return reply.send(data);
  });
}
