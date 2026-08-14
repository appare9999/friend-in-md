import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import type { LockRequest, UnlockRequest } from "../../shared/types.js";
import { log } from "../lib/log.js";

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

export function registerLockRoutes(app: FastifyInstance, state: ServerState): void {
  app.post<{ Body: LockRequest }>("/api/lock", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const { path: relPath } = req.body;
    if (!relPath) return reply.code(400).send({ error: "path required" });

    const lock = await ctx.lockStore.lock(relPath);
    ctx.watcher.emit("event", { type: "lock-changed", path: relPath, lock });
    log(`🔒 Locked: ${relPath}`);
    return { ok: true, lock };
  });

  app.post<{ Body: UnlockRequest }>("/api/unlock", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const { path: relPath } = req.body;
    if (!relPath) return reply.code(400).send({ error: "path required" });

    const lock = await ctx.lockStore.unlock(relPath);
    ctx.watcher.emit("event", { type: "lock-changed", path: relPath, lock });
    log(`🔓 Unlocked: ${relPath}`);
    return { ok: true, lock };
  });
}
