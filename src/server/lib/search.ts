import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFileTree } from "./fileTree.js";
import type { FileTreeNode, SearchResultItem } from "../../shared/types.js";

const MAX_MATCHES_PER_FILE = 5;
const MAX_RESULTS = 50;
const MAX_LINE_LENGTH = 200;

function flattenFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const files: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      files.push(node);
    } else {
      files.push(...flattenFiles(node.children ?? []));
    }
  }
  return files;
}

export async function searchFiles(root: string, query: string): Promise<SearchResultItem[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const tree = await buildFileTree(root);
  const files = flattenFiles(tree);
  const results: SearchResultItem[] = [];

  for (const file of files) {
    if (results.length >= MAX_RESULTS) break;

    const nameMatch = file.name.toLowerCase().includes(needle);

    if (file.tooLarge) {
      if (nameMatch) results.push({ path: file.path, nameMatch, matches: [] });
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(path.join(root, file.path), "utf-8");
    } catch {
      continue;
    }

    const matches: { line: number; text: string }[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        matches.push({ line: i + 1, text: lines[i].trim().slice(0, MAX_LINE_LENGTH) });
      }
    }

    if (nameMatch || matches.length > 0) {
      results.push({ path: file.path, nameMatch, matches });
    }
  }

  return results;
}
