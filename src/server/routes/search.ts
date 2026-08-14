import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import { searchFiles } from "../lib/search.js";
import { log } from "../lib/log.js";

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

export function registerSearchRoutes(app: FastifyInstance, state: ServerState): void {
  app.get<{ Querystring: { q?: string } }>("/api/search", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const query = req.query.q ?? "";
    const results = await searchFiles(ctx.root, query);
    if (query.trim()) {
      log(`🔍 Searched: "${query}" (${results.length} results)`);
    }
    return { query, results };
  });
}
