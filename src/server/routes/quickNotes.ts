import type { FastifyInstance } from "fastify";
import type { ServerState } from "../state.js";
import { listQuickNotes } from "../lib/quickNote.js";
import type { QuickNoteListResponse } from "../../shared/types.js";

export function registerQuickNoteRoutes(app: FastifyInstance, state: ServerState): void {
  app.get("/api/quick-notes", async (): Promise<QuickNoteListResponse> => {
    if (!state.ctx) return { notes: [], rootOpen: false };
    return { notes: await listQuickNotes(state.ctx.root), rootOpen: true };
  });
}
