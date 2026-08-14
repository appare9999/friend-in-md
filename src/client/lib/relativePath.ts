// Computes a portable markdown-relative path from `fromDir` (the directory of
// the note being edited, vault-root-relative, "" for root) to `targetPath`
// (a vault-root-relative posix path to the target file).
export function relativePosixPath(fromDir: string, targetPath: string): string {
  const fromParts = fromDir ? fromDir.split("/") : [];
  const toParts = targetPath.split("/");

  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) {
    i++;
  }

  const ups = fromParts.length - i;
  const downs = toParts.slice(i);
  return [...Array(ups).fill(".."), ...downs].join("/");
}
