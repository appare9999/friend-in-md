import type { FastifyInstance, FastifyReply } from "fastify";
import { promises as fs } from "node:fs";
import type { ServerState } from "../state.js";
import type { AppContext } from "../context.js";
import { resolveSafePath } from "../lib/fileTree.js";
import { BUILTIN_MARP_THEMES, listCustomMarpThemes, resolveCustomMarpThemeCssPath } from "../lib/marpThemes.js";
import { log } from "../lib/log.js";

function requireCtx(state: ServerState, reply: FastifyReply): AppContext | null {
  if (!state.ctx) {
    reply.code(409).send({ error: "No folder selected yet." });
    return null;
  }
  return state.ctx;
}

function setMarpTheme(content: string, theme: string): string {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!match || match.index === undefined) {
    throw new Error("File has no YAML front matter");
  }
  const [whole, open, body, close] = match;
  if (!/^\s*marp\s*:\s*true\s*$/m.test(body)) {
    throw new Error("File is not a Marp deck (marp: true not set)");
  }
  const newBody = /^\s*theme\s*:/m.test(body)
    ? body.replace(/^(\s*theme\s*:).*$/m, `$1 ${theme}`)
    : `${body}\ntheme: ${theme}`;
  return content.slice(0, match.index) + open + newBody + close + content.slice(match.index + whole.length);
}

export function registerMarpThemeRoutes(app: FastifyInstance, state: ServerState): void {
  app.get("/api/marp-themes", async (_req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;
    const custom = await listCustomMarpThemes(ctx.root);
    return { builtin: [...BUILTIN_MARP_THEMES], custom };
  });

  app.get<{ Querystring: { name?: string } }>("/api/marp-theme-css", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const fileName = req.query.name;
    if (!fileName) return reply.code(400).send({ error: "name query param required" });

    let absPath: string;
    try {
      absPath = resolveCustomMarpThemeCssPath(ctx.root, fileName);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    let css: string;
    try {
      css = await fs.readFile(absPath, "utf-8");
    } catch {
      return reply.code(404).send({ error: "Theme not found" });
    }

    reply.header("content-type", "text/css; charset=utf-8");
    return reply.send(css);
  });

  app.put<{ Body: { path?: string; theme?: string } }>("/api/marp-theme", async (req, reply) => {
    const ctx = requireCtx(state, reply);
    if (!ctx) return;

    const { path: relPath, theme } = req.body;
    if (!relPath) return reply.code(400).send({ error: "path required" });

    const custom = await listCustomMarpThemes(ctx.root);
    const validThemes = new Set<string>([...BUILTIN_MARP_THEMES, ...custom.map((t) => t.name)]);
    if (!theme || !validThemes.has(theme)) {
      return reply.code(400).send({ error: "Invalid theme" });
    }

    let absPath: string;
    try {
      absPath = resolveSafePath(ctx.root, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }

    let updated: string;
    try {
      updated = setMarpTheme(content, theme);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    await fs.writeFile(absPath, updated, "utf-8");
    log(`🎨 Changed Marp theme: ${relPath} -> ${theme}`);
    return { ok: true };
  });
}
