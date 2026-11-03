import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFileTree, resolveWithinRoot } from "./fileTree.js";
import type { FileTreeNode, QuickNoteSummary } from "../../shared/types.js";

const READ_CONCURRENCY = 16;

// Bounded worker pool instead of Promise.all(items.map(...)) - a folder with
// thousands of notes would otherwise open that many files at once.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

// Same narrow-regex frontmatter convention already used for Marp decks
// (src/client/lib/marp.ts's isMarpDocument) - no general YAML parser needed
// for a single boolean flag.
export function isQuickNote(content: string): boolean {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return false;
  return /^\s*quick\s*:\s*true\s*$/m.test(match[1]);
}

export function extractQuickNoteTitle(content: string, fallbackName: string): string {
  const body = content.replace(FRONTMATTER_RE, "");
  const heading = body.match(/^#\s+(.+?)\s*$/m);
  return heading ? heading[1].trim() : fallbackName;
}

function collectMarkdownPaths(nodes: FileTreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "dir") collectMarkdownPaths(node.children ?? [], out);
    else if (node.fileKind === "markdown") out.push(node.path);
  }
  return out;
}

// `folder` is an absolute path, independent of any open vault root - see
// quickNoteSettings.ts. Paths in the result are relative to `folder` itself.
export async function listQuickNotes(folder: string): Promise<QuickNoteSummary[]> {
  const tree = await buildFileTree(folder);
  const relPaths = collectMarkdownPaths(tree);

  const results = await mapWithConcurrency(relPaths, READ_CONCURRENCY, async (relPath) => {
    let content: string;
    try {
      content = await fs.readFile(resolveWithinRoot(folder, relPath), "utf-8");
    } catch {
      return null;
    }
    if (!isQuickNote(content)) return null;
    return { path: relPath, title: extractQuickNoteTitle(content, path.basename(relPath)) };
  });

  return results.filter((note): note is QuickNoteSummary => note !== null);
}
