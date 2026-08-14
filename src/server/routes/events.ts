import type { FastifyInstance } from "fastify";
import type { ServerState } from "../state.js";
import type { ServerEvent } from "../../shared/types.js";

export function registerEventRoutes(app: FastifyInstance, state: ServerState): void {
  app.get("/api/events", (_req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");

    const onEvent = (event: ServerEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    state.on("event", onEvent);

    const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 25000);

    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      state.off("event", onEvent);
    });
  });
}
