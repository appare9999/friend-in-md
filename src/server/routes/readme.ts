import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist-server/server/routes/readme.js -> package root is three levels up.
const README_PATH = path.resolve(__dirname, "../../../README.md");

export function registerReadmeRoutes(app: FastifyInstance): void {
  app.get("/api/readme", async (_req, reply) => {
    try {
      const content = await fs.readFile(README_PATH, "utf-8");
      return { content };
    } catch {
      return reply.code(404).send({ error: "README not found" });
    }
  });
}
