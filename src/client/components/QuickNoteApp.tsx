import { useEffect, useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import { fetchFile, fetchQuickNotes } from "../http/client.js";
import { stripFrontmatter } from "../lib/quickNoteFormat.js";
import type { QuickNoteSummary } from "@shared/types.js";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const LAST_NOTE_KEY = "friend-in-md:quickNote:lastPath";

type LoadState =
  | { status: "loading" }
  | { status: "no-root" }
  | { status: "empty" }
  | { status: "ready"; notes: QuickNoteSummary[] };

export function QuickNoteApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuickNotes()
      .then((res) => {
        if (cancelled) return;
        if (!res.rootOpen) {
          setState({ status: "no-root" });
          return;
        }
        if (res.notes.length === 0) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "ready", notes: res.notes });
        const remembered = sessionStorage.getItem(LAST_NOTE_KEY);
        const initial = res.notes.find((n) => n.path === remembered) ?? res.notes[0];
        setSelectedPath(initial.path);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "no-root" });
      });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    setContentError(null);
    fetchFile(selectedPath)
      .then((res) => {
        if (cancelled) return;
        setBodyHtml(md.render(stripFrontmatter(res.content)));
        sessionStorage.setItem(LAST_NOTE_KEY, selectedPath);
      })
      .catch((err) => {
        if (!cancelled) setContentError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const notes = useMemo(() => (state.status === "ready" ? state.notes : []), [state]);

  if (state.status === "loading") {
    return <div className="quick-note-empty">Loading…</div>;
  }

  if (state.status === "no-root") {
    return (
      <div className="quick-note-empty">
        No folder open yet. Pick one from the tray menu's "Open notes folder…".
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="quick-note-empty">
        <p>No quick notes yet. Add this to the top of any markdown file:</p>
        <pre>{`---\nquick: true\n---`}</pre>
      </div>
    );
  }

  return (
    <div className="quick-note-app">
      {notes.length > 1 && (
        <div className="quick-note-switcher">
          {notes.map((note) => (
            <button
              key={note.path}
              className={note.path === selectedPath ? "active" : ""}
              onClick={() => setSelectedPath(note.path)}
            >
              {note.title}
            </button>
          ))}
        </div>
      )}
      <div className="quick-note-body">
        {contentError ? (
          <div className="quick-note-empty">{contentError}</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        )}
      </div>
    </div>
  );
}
