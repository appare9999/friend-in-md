import type { TocEntry } from "../lib/markdownToc.js";

interface Props {
  entries: TocEntry[];
  onSelect: (index: number) => void;
}

export function Toc({ entries, onSelect }: Props) {
  if (entries.length === 0) {
    return <div className="toc-empty">見出しがありません</div>;
  }

  return (
    <ul className="toc-list">
      {entries.map((entry) => (
        <li key={entry.index}>
          <button
            type="button"
            className="toc-item"
            style={{ paddingLeft: `${8 + (entry.level - 1) * 14}px` }}
            onClick={() => onSelect(entry.index)}
            title={entry.text}
          >
            {entry.text || "(無題)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
