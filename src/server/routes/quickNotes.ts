import type { FastifyInstance } from "fastify";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { ServerState } from "../state.js";
import { resolveWithinRoot } from "../lib/fileTree.js";
import { pickFolderNative } from "../lib/nativeDialog.js";
import type {
  PickQuickNoteFolderResponse,
  QuickNoteContentResponse,
  QuickNoteFolderResponse,
  QuickNoteListResponse,
} from "../../shared/types.js";

export function registerQuickNoteRoutes(app: FastifyInstance, state: ServerState): void {
  app.get("/api/quick-notes", async (): Promise<QuickNoteListResponse> => {
    return { notes: await state.getQuickNotes(), folderOpen: state.quickNoteFolder !== null };
  });

  app.get("/api/quick-note-folder", async (): Promise<QuickNoteFolderResponse> => {
    return { folder: state.quickNoteFolder };
  });

  app.put<{ Body: { folder: string | null } }>("/api/quick-note-folder", async (req, reply) => {
    const folder = req.body.folder;
    if (folder !== null) {
      if (!path.isAbsolute(folder)) {
        return reply.code(400).send({ error: "folder must be an absolute path" });
      }
      const stat = await fs.stat(folder).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return reply.code(400).send({ error: "Not a directory" });
      }
    }

    await state.setQuickNoteFolder(folder);
    return { folder } satisfies QuickNoteFolderResponse;
  });

  // Same native OS folder dialog as "Open folder" (/api/pick-folder) - but
  // independent of it: this sets the standalone quick-note folder, not the
  // vault root, and doesn't require a root to be open at all.
  app.post("/api/quick-note-folder/pick", async (_req, reply) => {
    const result = await pickFolderNative();
    if (result.status === "unavailable") {
      return reply.code(404).send({ error: "No native folder dialog available on this system." });
    }
    if (result.status === "cancelled") {
      return { folder: null, cancelled: true } satisfies PickQuickNoteFolderResponse;
    }

    await state.setQuickNoteFolder(result.path);
    return { folder: result.path } satisfies PickQuickNoteFolderResponse;
  });

  app.get<{ Querystring: { path?: string } }>(
    "/api/quick-note-content",
    async (req, reply): Promise<QuickNoteContentResponse | undefined> => {
      if (!state.quickNoteFolder) {
        return reply.code(409).send({ error: "No quick-note folder configured." });
      }

      const relPath = req.query.path;
      if (!relPath) return reply.code(400).send({ error: "path query param required" });

      let absPath: string;
      try {
        absPath = resolveWithinRoot(state.quickNoteFolder, relPath);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }

      let content: string;
      try {
        content = await fs.readFile(absPath, "utf-8");
      } catch {
        return reply.code(404).send({ error: "File not found" });
      }

      return { content };
    }
  );
}
