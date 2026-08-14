import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BrowseResponse } from "../../shared/types.js";
import { resolveRootInput } from "../state.js";

export async function browseDirectory(input: string | undefined): Promise<BrowseResponse> {
  const target = await resolveRootInput(input && input.length > 0 ? input : os.homedir());

  const stat = await fs.stat(target).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Not a directory: ${target}`);
  }

  const entries = await fs.readdir(target, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(target);

  return {
    path: target,
    parent: parent === target ? null : parent,
    entries: dirs,
  };
}
