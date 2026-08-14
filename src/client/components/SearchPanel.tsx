import type { SearchResultItem } from "@shared/types.js";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  results: SearchResultItem[];
  searching: boolean;
  onSelect: (path: string) => void;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchPanel({ query, onQueryChange, results, searching, onSelect }: Props) {
  return (
    <div className="search-panel">
      <input
        type="search"
        className="search-input"
        placeholder="Search markdown files…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      {query.trim() && (
        <div className="search-results">
          {searching && <div className="search-status">Searching…</div>}
          {!searching && results.length === 0 && (
            <div className="search-status">No matches</div>
          )}
          {results.map((result) => (
            <div key={result.path} className="search-result">
              <button className="search-result-path" onClick={() => onSelect(result.path)}>
                {result.path}
              </button>
              {result.matches.map((match) => (
                <button
                  key={match.line}
                  className="search-result-line"
                  onClick={() => onSelect(result.path)}
                >
                  <span className="search-result-lineno">{match.line}</span>
                  <span className="search-result-text">
                    <Highlighted text={match.text} query={query} />
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
