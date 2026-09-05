import { promises as fs } from "node:fs";
import path from "node:path";

export const BUILTIN_MARP_THEMES = ["default", "gaia", "uncover"] as const;

const THEME_DIR_NAME = ".marp-themes";

export interface CustomMarpTheme {
  name: string;
  fileName: string;
}

export function marpThemeDir(root: string): string {
  return path.join(root, THEME_DIR_NAME);
}

function extractThemeName(css: string, fallback: string): string {
  const match = css.match(/@theme\s+([a-zA-Z0-9_-]+)/);
  return match ? match[1] : fallback;
}

// Custom themes are plain CSS files dropped in `<root>/.marp-themes/`, using
// Marp's own `/* @theme name */` convention to name themselves - the same
// files work unmodified with the Marp CLI/VS Code extension.
export async function listCustomMarpThemes(root: string): Promise<CustomMarpTheme[]> {
  let entries;
  try {
    entries = await fs.readdir(marpThemeDir(root), { withFileTypes: true });
  } catch {
    return [];
  }

  const themes: CustomMarpTheme[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".css")) continue;
    let css: string;
    try {
      css = await fs.readFile(path.join(marpThemeDir(root), entry.name), "utf-8");
    } catch {
      continue;
    }
    themes.push({ name: extractThemeName(css, entry.name.replace(/\.css$/i, "")), fileName: entry.name });
  }
  return themes;
}

export function resolveCustomMarpThemeCssPath(root: string, fileName: string): string {
  if (!/^[a-zA-Z0-9_-]+\.css$/i.test(fileName)) {
    throw new Error("Invalid theme file name");
  }
  return path.join(marpThemeDir(root), fileName);
}
