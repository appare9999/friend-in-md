import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileTreeNode, LockEntry, RootStatus, SearchResultItem } from "@shared/types.js";
import { FileTree } from "./components/FileTree.js";
import { Editor, type EditorHandle } from "./components/Editor.js";
import { CsvEditor } from "./components/CsvEditor.js";
import { Toolbar } from "./components/Toolbar.js";
import { RootPicker } from "./components/RootPicker.js";
import { SearchPanel } from "./components/SearchPanel.js";
import { ImagePickerModal } from "./components/ImagePickerModal.js";
import { LatexCheatsheetModal } from "./components/LatexCheatsheetModal.js";
import { Toc } from "./components/Toc.js";
import { relativePosixPath } from "./lib/relativePath.js";
import { extractToc } from "./lib/markdownToc.js";
import {
  fetchFile,
  fetchRootStatus,
  fetchTree,
  lockFile,
  saveFile,
  searchFiles,
  setRoot,
  subscribeEvents,
  unlockFile,
} from "./http/client.js";

const DEFAULT_LOCK: LockEntry = { locked: true, lockedAt: null };
const LAST_FILE_KEY = "friend-in-md:lastFile";

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
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [showLatexCheatsheet, setShowLatexCheatsheet] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  // The SSE subscription below only re-subscribes when selectedPath changes,
  // so its closure would otherwise see a stale hasUnsavedChanges from that
  // point in time - this ref keeps it current without resubscribing on
  // every keystroke.
  const hasUnsavedChangesRef = useRef(false);

  const reloadTree = useCallback(() => {
    fetchTree().then(setTree).catch((err) => setError(err.message));
  }, []);

  const openFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setLoadedPath(null);
      fetchFile(path)
        .then((res) => {
          setOriginalContent(res.content);
          setDraft(res.content);
          setLock(res.lock);
          setLoadedPath(path);
          setError(null);
          if (rootStatus?.root) writeLastFile(rootStatus.root, path);
        })
        .catch((err) => {
          setError(err.message);
          clearLastFile();
        });
    },
    [rootStatus?.root]
  );

  useEffect(() => {
    fetchRootStatus().then(setRootStatus).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (rootStatus?.root) reloadTree();
  }, [rootStatus?.root, reloadTree]);

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
    const unsubscribe = subscribeEvents((event) => {
      if (event.type === "root-changed") {
        setRootStatus(event.status);
        resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
      } else if (event.type === "tree-changed") {
        reloadTree();
      } else if (event.type === "file-changed" && event.path === selectedPath) {
        reloadTree();
        if (!hasUnsavedChangesRef.current) {
          fetchFile(event.path)
            .then((res) => {
              setOriginalContent(res.content);
              setDraft(res.content);
              setLock(res.lock);
            })
            .catch(() => {
              // transient read failure (e.g. mid-write) - next change event will retry
            });
        }
      } else if (event.type === "lock-changed" && event.path === selectedPath) {
        setLock(event.lock);
      } else if (event.type === "lock-changed") {
        reloadTree();
      }
    });
    return unsubscribe;
  }, [reloadTree, selectedPath]);

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
  const toc = useMemo(() => (isMarkdown ? extractToc(draft) : []), [isMarkdown, draft]);

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

  const handleSelectRoot = async (path: string) => {
    const status = await setRoot(path);
    setRootStatus(status);
  };

  const handleChangeFolder = () => {
    resetFileState(setSelectedPath, setDraft, setOriginalContent, setLock);
    setTree([]);
    setRootStatus({ root: null });
  };

  if (!rootStatus) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!rootStatus.root) {
    return <RootPicker onSelect={handleSelectRoot} />;
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
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
              <span className="sidebar-title" title={rootStatus.root}>
                You've got a friend in md (and csv)
              </span>
              <button className="change-folder-btn" onClick={handleChangeFolder}>
                Change folder
              </button>
            </>
          )}
        </div>
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
            />
            {showLatexCheatsheet && <LatexCheatsheetModal onClose={() => setShowLatexCheatsheet(false)} />}
            <div className="editor-pane">
              {selectedPath.toLowerCase().endsWith(".csv") ? (
                <CsvEditor
                  key={loadedPath}
                  ref={editorRef}
                  initialValue={draft}
                  readOnly={lock.locked}
                  onChange={setDraft}
                />
              ) : (
                <Editor
                  key={loadedPath}
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

      {isMarkdown && loadedPath === selectedPath && (
        <aside className={`toc-sidebar ${tocCollapsed ? "collapsed" : ""}`}>
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
