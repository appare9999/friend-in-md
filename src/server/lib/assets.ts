import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWithinRoot } from "./fileTree.js";
import type { AssetBrowseResponse, AssetEntry } from "../../shared/types.js";

const IGNORED = new Set(["node_modules", ".git", ".friend-in-md"]);

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function imageMimeFor(ext: string): string | null {
  return IMAGE_MIME[ext.toLowerCase()] ?? null;
}

export async function browseAssets(root: string, relDir: string): Promise<AssetBrowseResponse> {
  const absDir = resolveWithinRoot(root, relDir);
  const normalizedRoot = path.resolve(root);

  const stat = await fs.stat(absDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Not a directory: ${relDir}`);
  }

  const dirEntries = await fs.readdir(absDir, { withFileTypes: true });
  const entries: AssetEntry[] = [];
  for (const entry of dirEntries) {
    if (entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    const relPath = toPosix(path.relative(normalizedRoot, path.join(absDir, entry.name)));

    if (entry.isDirectory()) {
      entries.push({ name: entry.name, path: relPath, isDir: true });
    } else if (entry.isFile() && imageMimeFor(path.extname(entry.name))) {
      entries.push({ name: entry.name, path: relPath, isDir: false });
    }
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const relPosix = toPosix(path.relative(normalizedRoot, absDir));
  const parentAbs = path.dirname(absDir);
  const atRoot = absDir === normalizedRoot;

  return {
    path: relPosix,
    parent: atRoot ? null : toPosix(path.relative(normalizedRoot, parentAbs)),
    entries,
  };
}

export function resolveSafeImagePath(root: string, relPath: string): { abs: string; mime: string } {
  const abs = resolveWithinRoot(root, relPath);
  const mime = imageMimeFor(path.extname(abs));
  if (!mime) {
    throw new Error("Not a supported image type");
  }
  return { abs, mime };
}
