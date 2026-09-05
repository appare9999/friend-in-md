// Detects Marp slide decks by their YAML front matter (`marp: true`), the
// same convention the Marp CLI/VS Code extension use to recognize a deck.
export function isMarpDocument(content: string): boolean {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return false;
  return /^\s*marp\s*:\s*true\s*$/m.test(match[1]);
}

export const BUILTIN_MARP_THEMES = ["default", "gaia", "uncover"] as const;
export type MarpTheme = string;

// The raw `theme:` value from front matter, whatever it is - may name a
// built-in theme, a custom one, or nothing at all.
export function getRawMarpTheme(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1].match(/^\s*theme\s*:\s*(\S+)\s*$/m)?.[1];
}

// The theme to show as selected in the UI - falls back to "default" if the
// front matter's theme isn't one we currently know about (e.g. a custom
// theme file that got renamed or deleted).
export function getMarpTheme(content: string, availableThemes: readonly string[] = BUILTIN_MARP_THEMES): MarpTheme {
  const raw = getRawMarpTheme(content);
  return raw && availableThemes.includes(raw) ? raw : "default";
}
