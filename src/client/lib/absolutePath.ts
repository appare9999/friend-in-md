// Computes the parent of an absolute host filesystem path (not a
// vault-relative posix path - see relativePosixPath.ts for that). Handles
// both POSIX ("/home/me/notes") and Windows ("C:\Users\me\notes") paths
// since the server may run on either. Returns null once already at a
// filesystem root ("/" or "C:\") - nothing further up to go to.
export function parentOfAbsolutePath(p: string): string | null {
  const trimmed = p.replace(/[\\/]+$/, "");
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSep < 0) return null;

  const parent = trimmed.slice(0, lastSep);
  if (parent === "") return trimmed[0] === "/" ? "/" : null;
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
}
