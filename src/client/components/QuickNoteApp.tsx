import { useEffect, useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import { fetchQuickNoteContent, fetchQuickNotes } from "../http/client.js";
import { stripFrontmatter } from "../lib/quickNoteFormat.js";
import type { QuickNoteSummary } from "@shared/types.js";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};
const LAST_NOTE_KEY = "friend-in-md:quickNote:lastPath";

// Chromium's install prompt: fires only once the page meets its
// installability criteria (manifest + registered service worker).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

type LoadState =
  | { status: "loading" }
  | { status: "no-folder" }
  | { status: "empty" }
  | { status: "ready"; notes: QuickNoteSummary[] };

export function QuickNoteApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const [contentError, setContentError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchQuickNotes()
      .then((res) => {
        if (cancelled) return;
        if (!res.folderOpen) {
          setState({ status: "no-folder" });
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
        if (!cancelled) setState({ status: "no-folder" });
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
    fetchQuickNoteContent(selectedPath)
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

  if (state.status === "no-folder") {
    return (
      <div className="quick-note-empty">No quick-note folder set. Configure one in the main app's settings.</div>
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
      {installPrompt && (
        <button
          className="quick-note-install-btn"
          onClick={() => {
            installPrompt.prompt();
            setInstallPrompt(null);
          }}
          title="Install as a standalone app for quick access from your taskbar/dock"
        >
          📌 Install as app
        </button>
      )}
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
