import { useEffect, useState } from "react";
import type { AssetEntry } from "@shared/types.js";
import { assetUrl, browseAssets } from "../http/client.js";

interface Props {
  startDir: string;
  onSelect: (assetPath: string) => void;
  onClose: () => void;
}

export function ImagePickerModal({ startDir, onSelect, onClose }: Props) {
  const [dir, setDir] = useState(startDir);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<AssetEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    browseAssets(dir)
      .then((res) => {
        if (cancelled) return;
        setDir(res.path);
        setParent(res.parent);
        setEntries(res.entries);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>画像を挿入</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="image-picker-path" title={dir || "/"}>
          {dir ? `/${dir}` : "/"}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <ul className="image-picker-list">
          {parent !== null && (
            <li>
              <button className="image-picker-entry" onClick={() => setDir(parent)}>
                📁 ..
              </button>
            </li>
          )}
          {loading && <li className="image-picker-status">読み込み中…</li>}
          {!loading && entries.length === 0 && parent === null && (
            <li className="image-picker-status">画像もフォルダもありません</li>
          )}
          {entries.map((entry) =>
            entry.isDir ? (
              <li key={entry.path}>
                <button className="image-picker-entry" onClick={() => setDir(entry.path)}>
                  📁 {entry.name}
                </button>
              </li>
            ) : (
              <li key={entry.path}>
                <button className="image-picker-entry image-picker-file" onClick={() => onSelect(entry.path)}>
                  <img className="image-picker-thumb" src={assetUrl(entry.path)} alt="" />
                  <span>{entry.name}</span>
                </button>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}
