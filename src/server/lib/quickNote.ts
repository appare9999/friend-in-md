import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFileTree, resolveWithinRoot } from "./fileTree.js";
import type { FileTreeNode, QuickNoteSummary } from "../../shared/types.js";

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

export async function listQuickNotes(root: string): Promise<QuickNoteSummary[]> {
  const tree = await buildFileTree(root);
  const notes: QuickNoteSummary[] = [];
  for (const relPath of collectMarkdownPaths(tree)) {
    let content: string;
    try {
      content = await fs.readFile(resolveWithinRoot(root, relPath), "utf-8");
    } catch {
      continue;
    }
    if (isQuickNote(content)) {
      notes.push({ path: relPath, title: extractQuickNoteTitle(content, path.basename(relPath)) });
    }
  }
  return notes;
}
