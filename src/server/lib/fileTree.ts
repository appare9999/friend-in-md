import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileKind, FileTreeNode } from "../../shared/types.js";

const IGNORED = new Set(["node_modules", ".git", ".friend-in-md"]);
const MARKDOWN_EXT = new Set([".md", ".markdown"]);
const CSV_EXT = new Set([".csv"]);

// CSV is rendered as an in-memory grid of editable DOM cells, which doesn't
// scale the way a text/WYSIWYG editor does - block anything past this size
// instead of trying to open it.
export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function fileKindFor(ext: string): FileKind | null {
  if (MARKDOWN_EXT.has(ext)) return "markdown";
  if (CSV_EXT.has(ext)) return "csv";
  return null;
}

async function walk(root: string, relDir: string): Promise<FileTreeNode[]> {
  const absDir = path.join(root, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[friend-in-md] skipping unreadable directory ${absDir}: ${(err as Error).message}`);
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await walk(root, relPath);
      if (children.length > 0) {
        nodes.push({ name: entry.name, path: toPosix(relPath), type: "dir", children });
      }
      continue;
    }

    if (!entry.isFile()) continue;
    const fileKind = fileKindFor(path.extname(entry.name).toLowerCase());
    if (!fileKind) continue;

    let tooLarge = false;
    if (fileKind === "csv") {
      try {
        const stat = await fs.stat(path.join(absDir, entry.name));
        tooLarge = stat.size > MAX_CSV_BYTES;
      } catch {
        continue;
      }
    }

    nodes.push({ name: entry.name, path: toPosix(relPath), type: "file", fileKind, tooLarge });
  }
  return nodes;
}

export async function buildFileTree(root: string): Promise<FileTreeNode[]> {
  return walk(root, "");
}

export function resolveWithinRoot(root: string, relPath: string): string {
  const abs = path.resolve(root, relPath);
  const normalizedRoot = path.resolve(root);
  if (abs !== normalizedRoot && !abs.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Path escapes root directory");
  }
  return abs;
}

export function resolveSafePath(root: string, relPath: string): string {
  const abs = resolveWithinRoot(root, relPath);
  const ext = path.extname(abs).toLowerCase();
  if (!fileKindFor(ext)) {
    throw new Error("Only markdown or csv files are allowed");
  }
  return abs;
}
