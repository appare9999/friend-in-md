import type { LockEntry } from "@shared/types.js";

interface Props {
  path: string;
  lock: LockEntry;
  hasUnsavedChanges: boolean;
  saving: boolean;
  locking: boolean;
  unlocking: boolean;
  onSave: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onInsertImage?: () => void;
  onShowLatexCheatsheet: () => void;
}

export function Toolbar({
  path,
  lock,
  hasUnsavedChanges,
  saving,
  locking,
  unlocking,
  onSave,
  onLock,
  onUnlock,
  onUndo,
  onRedo,
  onInsertImage,
  onShowLatexCheatsheet,
}: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-path">{path}</span>

      <button className="latex-cheatsheet-btn" onClick={onShowLatexCheatsheet} title="LaTeX syntax reference">
        📐 LaTeX cheatsheet
      </button>

      {lock.locked ? (
        <div className="toolbar-locked">
          <span className="badge badge-locked">🔒 Locked</span>
          <button onClick={onUnlock} disabled={unlocking}>
            {unlocking ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      ) : (
        <div className="toolbar-editing">
          <span className="badge badge-editing">✏️ Editing</span>
          <button onClick={onUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button onClick={onRedo} title="Redo (Ctrl+Y)">
            ↷ Redo
          </button>
          {onInsertImage && <button onClick={onInsertImage}>🖼 画像を挿入</button>}
          <button onClick={onSave} disabled={saving || !hasUnsavedChanges}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onLock} disabled={locking}>
            {locking ? "Locking…" : "Lock"}
          </button>
        </div>
      )}
    </div>
  );
}
