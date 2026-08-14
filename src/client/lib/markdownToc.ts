export interface TocEntry {
  level: number;
  text: string;
  // Position of this heading among all headings in document order - matches
  // the order Milkdown renders <h1>-<h6> elements in, so it can be used to
  // find the corresponding rendered DOM node without needing stable ids.
  index: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

export function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;
  let fenceMarker = "";
  let index = 0;

  for (const line of markdown.split("\n")) {
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      entries.push({ level: headingMatch[1].length, text: headingMatch[2], index: index++ });
    }
  }

  return entries;
}
