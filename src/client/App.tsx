import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileTreeNode, LockEntry, RootStatus, SearchResultItem } from "@shared/types.js";
import { DEFAULT_CSV_LIMIT_BYTES, MAX_CSV_LIMIT_BYTES, MIN_CSV_LIMIT_BYTES } from "@shared/types.js";
import { FileTree } from "./components/FileTree.js";
import { Editor, type EditorHandle } from "./components/Editor.js";
import { CsvEditor } from "./components/CsvEditor.js";
import type { CsvFillMode } from "./lib/csvGrid.js";
import { Toolbar } from "./components/Toolbar.js";
import { RootPicker } from "./components/RootPicker.js";
import { SearchPanel } from "./components/SearchPanel.js";
import { ImagePickerModal } from "./components/ImagePickerModal.js";
import { LatexCheatsheetModal } from "./components/LatexCheatsheetModal.js";
import { MarpSlideView } from "./components/MarpSlideView.js";
import { MarpPresentationView } from "./components/MarpPresentationView.js";
import { Toc } from "./components/Toc.js";
import { relativePosixPath } from "./lib/relativePath.js";
import { parentOfAbsolutePath } from "./lib/absolutePath.js";
import { extractToc } from "./lib/markdownToc.js";
import { BUILTIN_MARP_THEMES, getMarpTheme, isMarpDocument, type MarpTheme } from "./lib/marp.js";
import {
  exportPptxUrl,
  fetchFile,
  fetchMarpThemes,
  fetchQuickNoteFolder,
  fetchRootStatus,
  fetchTree,
  lockFile,
  pickQuickNoteFolder,
  saveFile,
  searchFiles,
  setMarpTheme,
  setRoot,
  subscribeEvents,
  unlockFile,
  type CustomMarpTheme,
} from "./http/client.js";

const DEFAULT_LOCK: LockEntry = { locked: true, lockedAt: null };
const AUTOSAVE_IDLE_MS = 3000;
const LAST_FILE_KEY = "friend-in-md:lastFile";
const SIDEBAR_WIDTH_KEY = "friend-in-md:sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 640;

const CONTENT_WIDTH_KEY = "friend-in-md:contentWidth";
// 1100px matches the pre-existing fixed .editor-pane max-width - keep it as
// the default so PlantUML/other wide diagrams don't get squeezed unless the
// user opts into a narrower reading width.
const DEFAULT_CONTENT_WIDTH = 1100;
const MIN_CONTENT_WIDTH = 700;
const MAX_CONTENT_WIDTH = 1800;

const TOC_WIDTH_KEY = "friend-in-md:tocWidth";
const DEFAULT_TOC_WIDTH = 220;
const MIN_TOC_WIDTH = 160;
const MAX_TOC_WIDTH = 480;

const FONT_KEY = "friend-in-md:font";
interface FontOption {
  id: string;
  label: string;
  stack: string;
}
const FONT_OPTIONS: FontOption[] = [
  {
    id: "default",
    label: "Meiryo",
    stack:
      '"Meiryo", "Yu Gothic UI", "Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Rounded Mplus 1c", "Segoe UI", -apple-system, sans-serif',
  },
  { id: "sans", label: "Segoe UI", stack: '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif' },
  { id: "serif", label: "游明朝 (Yu Mincho)", stack: '"Yu Mincho", "Hiragino Mincho ProN", Georgia, "Times New Roman", serif' },
  { id: "mono", label: "MS ゴシック", stack: '"MS Gothic", "SFMono-Regular", Consolas, Menlo, monospace' },
];
const DEFAULT_FONT_ID = FONT_OPTIONS[0].id;

const CSV_LIMIT_KEY = "friend-in-md:csvLimitBytes";
const CSV_FILL_MODE_KEY = "friend-in-md:csvFillMode";

function readSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed)) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function writeSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function readContentWidth(): number {
  try {
    const raw = localStorage.getItem(CONTENT_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(MAX_CONTENT_WIDTH, Math.max(MIN_CONTENT_WIDTH, parsed)) : DEFAULT_CONTENT_WIDTH;
  } catch {
    return DEFAULT_CONTENT_WIDTH;
  }
}

function writeContentWidth(width: number): void {
  try {
    localStorage.setItem(CONTENT_WIDTH_KEY, String(width));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function readTocWidth(): number {
  try {
    const raw = localStorage.getItem(TOC_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(MAX_TOC_WIDTH, Math.max(MIN_TOC_WIDTH, parsed)) : DEFAULT_TOC_WIDTH;
  } catch {
    return DEFAULT_TOC_WIDTH;
  }
}

function writeTocWidth(width: number): void {
  try {
    localStorage.setItem(TOC_WIDTH_KEY, String(width));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function readFontId(): string {
  try {
    const raw = localStorage.getItem(FONT_KEY);
    return raw && FONT_OPTIONS.some((f) => f.id === raw) ? raw : DEFAULT_FONT_ID;
  } catch {
    return DEFAULT_FONT_ID;
  }
}

function writeFontId(id: string): void {
  try {
    localStorage.setItem(FONT_KEY, id);
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function readCsvLimitBytes(): number {
  try {
    const raw = localStorage.getItem(CSV_LIMIT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed)
      ? Math.min(MAX_CSV_LIMIT_BYTES, Math.max(MIN_CSV_LIMIT_BYTES, parsed))
      : DEFAULT_CSV_LIMIT_BYTES;
  } catch {
    return DEFAULT_CSV_LIMIT_BYTES;
  }
}

function writeCsvLimitBytes(bytes: number): void {
  try {
    localStorage.setItem(CSV_LIMIT_KEY, String(bytes));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function readCsvFillMode(): CsvFillMode {
  try {
    return localStorage.getItem(CSV_FILL_MODE_KEY) === "copy" ? "copy" : "series";
  } catch {
    return "series";
  }
}

function writeCsvFillMode(mode: CsvFillMode): void {
  try {
    localStorage.setItem(CSV_FILL_MODE_KEY, mode);
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function readLastFile(): { root: string; path: string } | null {
  try {
    const raw = localStorage.getItem(LAST_FILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastFile(root: string, path: string) {
  try {
    localStorage.setItem(LAST_FILE_KEY, JSON.stringify({ root, path }));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

function clearLastFile() {
  try {
    localStorage.removeItem(LAST_FILE_KEY);
  } catch {
    // ignore
  }
}

function resetFileState(
  setSelectedPath: (v: string | null) => void,
  setDraft: (v: string) => void,
  setOriginalContent: (v: string) => void,
  setLock: (v: LockEntry) => void
) {
  setSelectedPath(null);
  setDraft("");
  setOriginalContent("");
  setLock(DEFAULT_LOCK);
}

export default function App() {
  const [rootStatus, setRootStatus] = useState<RootStatus | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [draft, setDraft] = useState("");
  const [lock, setLock] = useState<LockEntry>(DEFAULT_LOCK);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => readSidebarWidth());
  const [contentWidth, setContentWidth] = useState(() => readContentWidth());
  const [tocWidth, setTocWidth] = useState(() => readTocWidth());
  const [fontId, setFontId] = useState(() => readFontId());
  const [csvLimitBytes, setCsvLimitBytes] = useState(() => readCsvLimitBytes());
  const [csvFillMode, setCsvFillMode] = useState<CsvFillMode>(() => readCsvFillMode());
  const [showSidebarSettings, setShowSidebarSettings] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [showLatexCheatsheet, setShowLatexCheatsheet] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [pptxExporting, setPptxExporting] = useState(false);
  const [marpThemeSaving, setMarpThemeSaving] = useState(false);
  const [customMarpThemes, setCustomMarpThemes] = useState<CustomMarpTheme[]>([]);
  const [quickNoteFolder, setQuickNoteFolderState] = useState<string | null>(null);
  const [quickNoteFolderSaving, setQuickNoteFolderSaving] = useState(false);
  // Bumped whenever an external change (e.g. an AI tool editing the file on
  // disk) refreshes draft/originalContent - included in the editor's `key`
  // so Milkdown/the CSV grid remount and pick up the new content instead of
  // keeping whatever they'd already rendered from the old initialValue.
  const [contentVersion, setContentVersion] = useState(0);
  const editorRef = useRef<EditorHandle>(null);

  // The SSE subscription below only re-subscribes when selectedPath changes,
  // so its closure would otherwise see a stale hasUnsavedChanges from that
  // point in time - this ref keeps it current without resubscribing on
  // every keystroke.
  const hasUnsavedChangesRef = useRef(false);
  const rootRef = useRef<string | null>(null);
  rootRef.current = rootStatus?.root ?? null;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-family",
      FONT_OPTIONS.find((f) => f.id === fontId)?.stack ?? FONT_OPTIONS[0].stack
    );
  }, [fontId]);

  useEffect(() => {
    document.documentElement.style.setProperty("--content-max-width", `${contentWidth}px`);
  }, [contentWidth]);

  const reloadTree = useCallback(() => {
    fetchTree(csvLimitBytes).then(setTree).catch((err) => setError(err.message));
  }, [csvLimitBytes]);

  const openFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setLoadedPath(null);
      fetchFile(path, csvLimitBytes)
        .then((res) => {
          setOriginalContent(res.content);
          setDraft(res.content);
          setLock(res.lock);
          setLoadedPath(path);
          setContentVersion(0);
          setError(null);
          if (rootStatus?.root) writeLastFile(rootStatus.root, path);
        })
        .catch((err) => {
          setError(err.message);
          clearLastFile();
        });
    },
    [rootStatus?.root, csvLimitBytes]
  );

  useEffect(() => {
    fetchRootStatus().then(setRootStatus).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (rootStatus?.root) reloadTree();
  }, [rootStatus?.root, reloadTree]);

  // Show the root folder name in the browser tab so multiple tabs are distinguishable.
  useEffect(() => {
    const root = rootStatus?.root;
    const folderName = root?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    document.title = folderName ? `${folderName} - friend in md` : "You've got a friend in md";
  }, [rootStatus?.root]);

  // Independent of rootStatus.root - the quick-note folder is a standalone
  // setting, not scoped to whichever vault happens to be open.
  useEffect(() => {
    fetchQuickNoteFolder()
      .then((res) => setQuickNoteFolderState(res.folder))
      .catch(() => {
        // quick-note folder setting is a nice-to-have - fall back to "not set"
      });
  }, []);

  const handlePickQuickNoteFolder = useCallback(() => {
    setQuickNoteFolderSaving(true);
    pickQuickNoteFolder()
      .then((res) => {
        // Cancelled: leave the previously configured folder untouched.
        if (!res.cancelled) setQuickNoteFolderState(res.folder);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setQuickNoteFolderSaving(false));
  }, []);

  // Restore the last-opened file after a page reload - the server keeps the
  // root across reloads, but selectedPath is plain React state and would
  // otherwise reset to the blank "select a file" screen every time.
  useEffect(() => {
    if (!rootStatus?.root) return;
    const last = readLastFile();
    if (last && last.root === rootStatus.root) openFile(last.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootStatus?.root]);

  useEffect(() => {
    const refreshSelectedFile = () => {
      if (!selectedPath || hasUnsavedChangesRef.current) return;
      fetchFile(selectedPath, csvLimitBytes)
        .then((res) => {
          setOriginalContent(res.content);
          setDraft(res.content);
          setLock(res.lock);
          setContentVersion((v) => v + 1);
        })
        .catch(() => {
          // transient read failure (e.g. mid-write) - next change event will retry
        });
    };

    const handleReconnect = async () => {
      const known = rootRef.current;
      const status = await fetchRootStatus().catch(() => null);
      if (!status) return;
      if (!status.root && known) {
        // The server restarted (e.g. `tsx watch` in dev) and forgot its
        // folder, so it would never send change events for it - reopen it.
        await setRoot(known).catch(() => {});
      } else if (status.root !== known) {
        setRootStatus(status);
        resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
        return;
      }
      // Changes made while disconnected produced no events.
      reloadTree();
      refreshSelectedFile();
    };

    const unsubscribe = subscribeEvents((event) => {
      if (event.type === "root-changed") {
        // Re-opening the current folder (e.g. restored after a server
        // restart) shouldn't throw away the open file.
        if (event.status.root === rootRef.current) {
          reloadTree();
          return;
        }
        setRootStatus(event.status);
        resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
      } else if (event.type === "tree-changed") {
        reloadTree();
      } else if (event.type === "file-changed" && event.path === selectedPath) {
        reloadTree();
        refreshSelectedFile();
      } else if (event.type === "lock-changed" && event.path === selectedPath) {
        setLock(event.lock);
      } else if (event.type === "lock-changed") {
        reloadTree();
      }
    }, handleReconnect);
    return unsubscribe;
  }, [reloadTree, selectedPath, csvLimitBytes]);

  const hasUnsavedChanges = draft !== originalContent;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchFiles(q)
        .then((res) => setSearchResults(res.results))
        .catch((err) => setError(err.message))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const isMarkdown = !!selectedPath && !selectedPath.toLowerCase().endsWith(".csv");
  const isMarp = isMarkdown && isMarpDocument(draft);
  const toc = useMemo(() => (isMarkdown ? extractToc(draft) : []), [isMarkdown, draft]);

  useEffect(() => {
    if (!isMarp) return;
    fetchMarpThemes()
      .then((res) => setCustomMarpThemes(res.custom))
      .catch(() => {
        // theme list is a nice-to-have for the picker - fall back to built-ins only
      });
  }, [isMarp, rootStatus?.root]);

  const marpThemeOptions = useMemo(
    () => [...BUILTIN_MARP_THEMES, ...customMarpThemes.map((t) => t.name)],
    [customMarpThemes]
  );
  const marpTheme = isMarp ? getMarpTheme(draft, marpThemeOptions) : undefined;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    setError(null);
    try {
      await saveFile(selectedPath, draft);
      setOriginalContent(draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Autosave: once the user stops typing for a bit, save the draft on their
  // behalf so unsaved work survives a crash/closed tab without needing a
  // manual Save click. Skipped while the file is locked (editor is read-only
  // there anyway) or a save is already in flight.
  useEffect(() => {
    if (!hasUnsavedChanges || !selectedPath || loadedPath !== selectedPath || lock.locked || saving) return;
    const timer = setTimeout(() => {
      handleSave();
    }, AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, hasUnsavedChanges, selectedPath, loadedPath, lock.locked, saving]);

  const handleLock = async () => {
    if (!selectedPath) return;
    setLocking(true);
    setError(null);
    try {
      if (hasUnsavedChanges) {
        await saveFile(selectedPath, draft);
        setOriginalContent(draft);
      }
      const { lock: newLock } = await lockFile({ path: selectedPath });
      setLock(newLock);
      reloadTree();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedPath) return;
    setUnlocking(true);
    setError(null);
    try {
      const { lock: newLock } = await unlockFile({ path: selectedPath });
      setLock(newLock);
      reloadTree();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleExportPdf = () => {
    window.print();
  };

  const handleExportPptx = async () => {
    if (!selectedPath) return;
    setPptxExporting(true);
    setError(null);
    try {
      const res = await fetch(exportPptxUrl(selectedPath));
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const outName = selectedPath.replace(/\.(md|markdown)$/i, ".pptx").split("/").pop() ?? "export.pptx";
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPptxExporting(false);
    }
  };

  const handleChangeMarpTheme = async (theme: MarpTheme) => {
    if (!selectedPath) return;
    setMarpThemeSaving(true);
    setError(null);
    try {
      await setMarpTheme(selectedPath, theme);
      const res = await fetchFile(selectedPath);
      setOriginalContent(res.content);
      setDraft(res.content);
      setLock(res.lock);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMarpThemeSaving(false);
    }
  };

  const handleSelectRoot = async (path: string) => {
    const status = await setRoot(path);
    setRootStatus(status);
  };

  const handleSidebarWidthChange = (width: number) => {
    setSidebarWidth(width);
    writeSidebarWidth(width);
  };

  const handleContentWidthChange = (width: number) => {
    setContentWidth(width);
    writeContentWidth(width);
  };

  const handleTocWidthChange = (width: number) => {
    setTocWidth(width);
    writeTocWidth(width);
  };

  const handleFontChange = (id: string) => {
    setFontId(id);
    writeFontId(id);
  };

  const handleCsvFillModeChange = (mode: CsvFillMode) => {
    setCsvFillMode(mode);
    writeCsvFillMode(mode);
  };

  const handleCsvLimitChange = (bytes: number) => {
    setCsvLimitBytes(bytes);
    writeCsvLimitBytes(bytes);
  };

  // Browsers only honor one activation-gated API call per user gesture -
  // window.open() and requestFullscreen() can't both fire from the same
  // click. Going fullscreen is the one that has to always work here, so
  // opening the presenter notes window is a separate, optional button inside
  // the slideshow itself (MarpPresentationView) rather than automatic here.
  const handlePresent = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setShowPresentation(true);
  };

  const handleChangeFolder = () => {
    resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
    setTree([]);
    setRootStatus({ root: null });
  };

  const handleGoToParentFolder = async () => {
    if (!rootStatus?.root) return;
    const parent = parentOfAbsolutePath(rootStatus.root);
    if (!parent) return;
    resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
    setTree([]);
    try {
      const status = await setRoot(parent);
      setRootStatus(status);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!rootStatus) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!rootStatus.root) {
    return <RootPicker onSelect={handleSelectRoot} />;
  }

  return (
    <div className="app">
      <aside
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
      >
        <div className="sidebar-header">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
          {!sidebarCollapsed && (
            <>
              <span className="sidebar-header-spacer" title={rootStatus.root} />
              <button
                className="quick-note-launch-btn"
                onClick={() => window.open("/quick-note.html", "friend-in-md-quick-note", "popup,width=380,height=560")}
                title="Open the quick-note popup (installable as its own app from within it)"
              >
                📝 Quick note
              </button>
              <button
                className="sidebar-settings-btn"
                onClick={() => setShowSidebarSettings((v) => !v)}
                title="Settings"
                aria-expanded={showSidebarSettings}
              >
                ⚙
              </button>
              <button
                className="parent-folder-btn"
                onClick={handleGoToParentFolder}
                disabled={!parentOfAbsolutePath(rootStatus.root)}
                title="Open the parent of the current folder"
              >
                ↑ Parent folder
              </button>
              <button className="change-folder-btn" onClick={handleChangeFolder}>
                Change folder
              </button>
            </>
          )}
        </div>
        {!sidebarCollapsed && showSidebarSettings && (
          <div className="sidebar-settings-panel">
            <div className="settings-row">
              <label htmlFor="sidebar-width-range">Sidebar width: {sidebarWidth}px</label>
              <input
                id="sidebar-width-range"
                type="range"
                min={MIN_SIDEBAR_WIDTH}
                max={MAX_SIDEBAR_WIDTH}
                step={10}
                value={sidebarWidth}
                onChange={(e) => handleSidebarWidthChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="content-width-range">Content width: {contentWidth}px</label>
              <input
                id="content-width-range"
                type="range"
                min={MIN_CONTENT_WIDTH}
                max={MAX_CONTENT_WIDTH}
                step={20}
                value={contentWidth}
                onChange={(e) => handleContentWidthChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="font-select">Font</label>
              <select id="font-select" value={fontId} onChange={(e) => handleFontChange(e.target.value)}>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <label htmlFor="toc-width-range">Table of contents width: {tocWidth}px</label>
              <input
                id="toc-width-range"
                type="range"
                min={MIN_TOC_WIDTH}
                max={MAX_TOC_WIDTH}
                step={10}
                value={tocWidth}
                onChange={(e) => handleTocWidthChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-row quick-note-folder-row">
              <label>Quick note folder</label>
              <div className="quick-note-folder-current" title={quickNoteFolder ?? undefined}>
                {quickNoteFolder ?? "Not set"}
              </div>
              <button
                className="quick-note-folder-browse-btn"
                onClick={handlePickQuickNoteFolder}
                disabled={quickNoteFolderSaving}
                title="Pick the folder to scan for quick notes, using your OS's folder dialog (same as Open folder) - independent of whichever vault is open"
              >
                {quickNoteFolder ? "Change…" : "Set folder…"}
              </button>
            </div>
            <div className="settings-row">
              <label htmlFor="csv-limit-range">CSV size limit: {formatBytes(csvLimitBytes)}</label>
              <input
                id="csv-limit-range"
                type="range"
                min={MIN_CSV_LIMIT_BYTES}
                max={MAX_CSV_LIMIT_BYTES}
                step={50 * 1024}
                value={csvLimitBytes}
                onChange={(e) => handleCsvLimitChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="csv-fill-mode-select">CSV fill handle drag</label>
              <select
                id="csv-fill-mode-select"
                value={csvFillMode}
                onChange={(e) => handleCsvFillModeChange(e.target.value as CsvFillMode)}
              >
                <option value="series">Series (1, 2, 3…)</option>
                <option value="copy">Copy (1, 1, 1…)</option>
              </select>
            </div>
          </div>
        )}
        {!sidebarCollapsed && (
          <>
            <div className="sidebar-root-path" title={rootStatus.root}>
              {rootStatus.root}
            </div>
            <SearchPanel
              query={searchQuery}
              onQueryChange={setSearchQuery}
              results={searchResults}
              searching={searching}
              onSelect={(path) => {
                openFile(path);
                setSearchQuery("");
              }}
            />
            {!searchQuery.trim() && (
              <FileTree nodes={tree} selectedPath={selectedPath} onSelect={openFile} />
            )}
          </>
        )}
      </aside>

      <main className="main">
        {error && <div className="error-banner">{error}</div>}

        {selectedPath && loadedPath === selectedPath ? (
          <>
            <Toolbar
              path={selectedPath}
              lock={lock}
              hasUnsavedChanges={hasUnsavedChanges}
              saving={saving}
              locking={locking}
              unlocking={unlocking}
              onSave={handleSave}
              onLock={handleLock}
              onUnlock={handleUnlock}
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              onInsertImage={
                selectedPath.toLowerCase().endsWith(".csv") ? undefined : () => setShowImagePicker(true)
              }
              onShowLatexCheatsheet={() => setShowLatexCheatsheet(true)}
              onExportPdf={isMarkdown ? handleExportPdf : undefined}
              onExportPptx={isMarp ? handleExportPptx : undefined}
              onPresent={isMarp ? handlePresent : undefined}
              pptxExporting={pptxExporting}
              viewOnly={isMarp}
              marpTheme={marpTheme}
              marpThemeOptions={marpThemeOptions}
              onChangeMarpTheme={isMarp ? handleChangeMarpTheme : undefined}
              marpThemeSaving={marpThemeSaving}
            />
            {showLatexCheatsheet && <LatexCheatsheetModal onClose={() => setShowLatexCheatsheet(false)} />}
            {showPresentation && isMarp && (
              <MarpPresentationView
                content={draft}
                customThemes={customMarpThemes}
                onClose={() => setShowPresentation(false)}
              />
            )}
            <div className="editor-pane">
              {isMarp ? (
                <MarpSlideView content={draft} customThemes={customMarpThemes} />
              ) : selectedPath.toLowerCase().endsWith(".csv") ? (
                <CsvEditor
                  key={`${loadedPath}:${contentVersion}:${lock.locked}`}
                  ref={editorRef}
                  initialValue={draft}
                  readOnly={lock.locked}
                  fillMode={csvFillMode}
                  onChange={setDraft}
                />
              ) : (
                <Editor
                  key={`${loadedPath}:${contentVersion}:${lock.locked}`}
                  ref={editorRef}
                  initialValue={draft}
                  readOnly={lock.locked}
                  filePath={selectedPath}
                  onChange={setDraft}
                />
              )}
            </div>
            {showImagePicker && (
              <ImagePickerModal
                startDir={selectedPath.includes("/") ? selectedPath.slice(0, selectedPath.lastIndexOf("/")) : ""}
                onClose={() => setShowImagePicker(false)}
                onSelect={(assetPath) => {
                  const noteDir = selectedPath.includes("/")
                    ? selectedPath.slice(0, selectedPath.lastIndexOf("/"))
                    : "";
                  editorRef.current?.insertImage?.(relativePosixPath(noteDir, assetPath));
                  setShowImagePicker(false);
                }}
              />
            )}
          </>
        ) : selectedPath ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <div className="empty-state">Select a markdown file from the left.</div>
        )}
      </main>

      {isMarkdown && !isMarp && loadedPath === selectedPath && (
        <aside
          className={`toc-sidebar ${tocCollapsed ? "collapsed" : ""}`}
          style={tocCollapsed ? undefined : { width: tocWidth }}
        >
          <div className="toc-sidebar-header">
            {!tocCollapsed && <span>table of contents</span>}
            <button
              className="sidebar-toggle-btn"
              onClick={() => setTocCollapsed((v) => !v)}
              title={tocCollapsed ? "Expand table of contents" : "Collapse table of contents"}
              aria-expanded={!tocCollapsed}
            >
              {tocCollapsed ? "«" : "»"}
            </button>
          </div>
          {!tocCollapsed && <Toc entries={toc} onSelect={(index) => editorRef.current?.scrollToHeading?.(index)} />}
        </aside>
      )}
    </div>
  );
}
