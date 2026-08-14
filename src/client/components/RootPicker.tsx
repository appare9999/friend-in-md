import { useEffect, useState } from "react";
import { fetchReadme, pickFolderNative } from "../http/client.js";
import { Editor } from "./Editor.js";

const RECENTS_KEY = "friend-in-md:recentRoots";

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(path: string): void {
  const recents = [path, ...loadRecents().filter((p) => p !== path)].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

interface Props {
  onSelect: (path: string) => Promise<void>;
}

export function RootPicker({ onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nativeUnavailable, setNativeUnavailable] = useState(false);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readme, setReadme] = useState<string | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);

  useEffect(() => {
    if (!readmeOpen || readme !== null || readmeError) return;
    fetchReadme()
      .then(setReadme)
      .catch((err) => setReadmeError((err as Error).message));
  }, [readmeOpen, readme, readmeError]);

  const handlePickNative = async () => {
    setBusy(true);
    setError(null);
    try {
      const path = await pickFolderNative();
      await handleUse(path);
    } catch {
      setNativeUnavailable(true);
      setBusy(false);
    }
  };

  const handleUse = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      await onSelect(path);
      pushRecent(path);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="root-picker">
      <h1>You've got a friend in md (and csv)</h1>
      <p>Choose the folder of markdown files you want to browse and edit.</p>

      {!nativeUnavailable && (
        <button className="native-picker-btn" onClick={handlePickNative} disabled={busy}>
          Open folder
        </button>
      )}
      {nativeUnavailable && (
        <p className="native-picker-hint">
          Native folder picker isn't available (unsupported OS or dialog tool not installed).
        </p>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="readme-accordion">
        <button
          type="button"
          className="readme-accordion-header"
          onClick={() => setReadmeOpen((v) => !v)}
          aria-expanded={readmeOpen}
        >
          <span className={`readme-accordion-caret ${readmeOpen ? "open" : ""}`}>▶</span>
          README
        </button>
        {readmeOpen && (
          <div className="readme-accordion-body">
            {readmeError && <div className="error-banner">{readmeError}</div>}
            {!readmeError && readme === null && <p className="native-picker-hint">Loading…</p>}
            {readme !== null && (
              <Editor initialValue={readme} readOnly filePath="README.md" onChange={() => {}} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
