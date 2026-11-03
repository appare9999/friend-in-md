import type { FastifyInstance } from "fastify";
import type { ServerState } from "../state.js";
import type { SetRootRequest } from "../../shared/types.js";
import { browseDirectory } from "../lib/browse.js";
import { pickFolderNative } from "../lib/nativeDialog.js";

export function registerRootRoutes(app: FastifyInstance, state: ServerState): void {
  app.get("/api/root", async () => state.status());

  app.post<{ Body: SetRootRequest }>("/api/root", async (req, reply) => {
    const { path: input } = req.body;
    if (!input) return reply.code(400).send({ error: "path required" });
    try {
      const status = await state.setRoot(input);
      return status;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get<{ Querystring: { path?: string } }>("/api/browse", async (req, reply) => {
    try {
      return await browseDirectory(req.query.path);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post("/api/pick-folder", async (_req, reply) => {
    const result = await pickFolderNative();
    if (result.status === "unavailable") {
      return reply.code(404).send({ error: "No native folder dialog available on this system." });
    }
    // Cancelled: not an error - just no folder chosen this time.
    return { path: result.status === "picked" ? result.path : null };
  });
}
