import { deflateSync, inflateRawSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { log } from "../lib/log.js";

const PLANTUML_SERVER = "https://www.plantuml.com/plantuml";
const KROKI_SERVER = "https://kroki.io";
const ALLOWED_FORMATS = new Set(["svg", "png"]);
const ENCODED_RE = /^[0-9A-Za-z_-]+$/;
const FETCH_TIMEOUT_MS = 10_000;
const PRIMARY_ATTEMPTS = 2;

// Small in-memory cache so rapid re-renders of the same diagram (e.g. the
// user editing an unrelated line) don't all round-trip to the public server.
const cache = new Map<string, { contentType: string; body: Buffer }>();
const CACHE_LIMIT = 200;

function cacheGet(key: string) {
  return cache.get(key);
}

function cacheSet(key: string, value: { contentType: string; body: Buffer }) {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// plantuml.com's public server is flaky under load and occasionally answers
// a perfectly valid request with a bare 400/502. A couple of quick retries
// clear the transient case without the user having to notice or re-edit.
async function fetchPlantumlWithRetry(
  format: string,
  encoded: string
): Promise<{ ok: true; contentType: string; body: Buffer } | { ok: false; status: number; detail: string }> {
  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 1; attempt <= PRIMARY_ATTEMPTS; attempt++) {
    try {
      const upstream = await fetchWithTimeout(`${PLANTUML_SERVER}/${format}/${encoded}`);
      if (upstream.ok) {
        const contentType = upstream.headers.get("content-type") ?? "image/svg+xml";
        return { ok: true, contentType, body: Buffer.from(await upstream.arrayBuffer()) };
      }
      lastStatus = upstream.status;
      lastDetail = (await upstream.text().catch(() => "")).slice(0, 300);
    } catch (err) {
      lastStatus = 0;
      lastDetail = (err as Error).message;
    }
    if (attempt < PRIMARY_ATTEMPTS) await sleep(300 * attempt);
  }
  return { ok: false, status: lastStatus, detail: lastDetail };
}

// Recovers the original diagram source from plantuml.com's custom base64
// variant + raw-deflate encoding, so it can be re-encoded for a fallback
// renderer that speaks a different wire format (kroki.io: zlib deflate +
// URL-safe base64).
function decodePlantumlSource(encoded: string): string {
  const decode6bit = (ch: string): number => {
    const code = ch.charCodeAt(0);
    if (ch >= "0" && ch <= "9") return code - 48;
    if (ch >= "A" && ch <= "Z") return code - 65 + 10;
    if (ch >= "a" && ch <= "z") return code - 97 + 36;
    if (ch === "-") return 62;
    if (ch === "_") return 63;
    throw new Error("invalid plantuml-encoded character");
  };

  const bytes: number[] = [];
  for (let i = 0; i + 3 < encoded.length; i += 4) {
    const c1 = decode6bit(encoded[i]);
    const c2 = decode6bit(encoded[i + 1]);
    const c3 = decode6bit(encoded[i + 2]);
    const c4 = decode6bit(encoded[i + 3]);
    bytes.push((c1 << 2) | (c2 >> 4));
    bytes.push(((c2 & 0xf) << 4) | (c3 >> 2));
    bytes.push(((c3 & 0x3) << 6) | c4);
  }
  const inflated = inflateRawSync(Buffer.from(bytes));
  return inflated.toString("utf8").replace(/\0+$/, "");
}

function encodeForKroki(source: string): string {
  return deflateSync(Buffer.from(source, "utf8"), { level: 9 })
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function fetchKrokiFallback(
  format: string,
  encoded: string
): Promise<{ ok: true; contentType: string; body: Buffer } | { ok: false; detail: string }> {
  try {
    const source = decodePlantumlSource(encoded);
    const krokiEncoded = encodeForKroki(source);
    const upstream = await fetchWithTimeout(`${KROKI_SERVER}/plantuml/${format}/${krokiEncoded}`);
    if (!upstream.ok) {
      return { ok: false, detail: `kroki.io returned ${upstream.status}` };
    }
    const contentType = upstream.headers.get("content-type") ?? (format === "png" ? "image/png" : "image/svg+xml");
    return { ok: true, contentType, body: Buffer.from(await upstream.arrayBuffer()) };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export function registerDiagramRoutes(app: FastifyInstance): void {
  app.get<{ Params: { format: string; encoded: string } }>(
    "/api/diagrams/plantuml/:format/:encoded",
    async (req, reply) => {
      const { format, encoded } = req.params;

      if (!ALLOWED_FORMATS.has(format)) {
        return reply.code(400).send({ error: "format must be svg or png" });
      }
      if (!ENCODED_RE.test(encoded)) {
        return reply.code(400).send({ error: "invalid encoded diagram" });
      }

      const cacheKey = `${format}/${encoded}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        reply.header("content-type", cached.contentType);
        return reply.send(cached.body);
      }

      const primary = await fetchPlantumlWithRetry(format, encoded);
      if (primary.ok) {
        cacheSet(cacheKey, { contentType: primary.contentType, body: primary.body });
        reply.header("content-type", primary.contentType);
        return reply.send(primary.body);
      }

      log(`⚠️ PlantUML: official server didn't respond, falling back to kroki.io`);
      const fallback = await fetchKrokiFallback(format, encoded);
      if (fallback.ok) {
        cacheSet(cacheKey, { contentType: fallback.contentType, body: fallback.body });
        reply.header("content-type", fallback.contentType);
        return reply.send(fallback.body);
      }

      log(`❌ PlantUML: failed to render diagram`);
      const detail = primary.status ? `plantuml.com returned ${primary.status}: ${primary.detail}` : primary.detail;
      return reply.code(502).send({ error: `${detail} (fallback also failed: ${fallback.detail})` });
    }
  );
}
