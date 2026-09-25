import type { LockEntry } from "@shared/types.js";
import type { MarpTheme } from "../lib/marp.js";

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
  onExportPdf?: () => void;
  onExportPptx?: () => void;
  onPresent?: () => void;
  pptxExporting?: boolean;
  viewOnly?: boolean;
  marpTheme?: MarpTheme;
  marpThemeOptions?: MarpTheme[];
  onChangeMarpTheme?: (theme: MarpTheme) => void;
  marpThemeSaving?: boolean;
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
  onExportPdf,
  onExportPptx,
  onPresent,
  pptxExporting,
  viewOnly,
  marpTheme,
  marpThemeOptions,
  onChangeMarpTheme,
  marpThemeSaving,
}: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-path">{path}</span>

      {onChangeMarpTheme && (
        <label className="marp-theme-picker">
          Theme:
          <select
            value={marpTheme}
            disabled={marpThemeSaving}
            onChange={(e) => onChangeMarpTheme(e.target.value as MarpTheme)}
          >
            {(marpThemeOptions ?? []).map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>
      )}
      {onExportPdf && (
        <button onClick={onExportPdf} title="Print to PDF via the browser print dialog">
          🖨 Export PDF
        </button>
      )}
      {onExportPptx && (
        <button onClick={onExportPptx} disabled={pptxExporting} title="Export this Marp deck as a PowerPoint file">
          {pptxExporting ? "Converting…" : "🎞 Export PowerPoint"}
        </button>
      )}
      {onPresent && (
        <button onClick={onPresent} title="Fullscreen slideshow - also opens a presenter-notes window you can drag to a second display">
          ▶ Present
        </button>
      )}

      {!viewOnly && (
        <>
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
              {onInsertImage && <button onClick={onInsertImage}>🖼 Insert image</button>}
              <button onClick={onSave} disabled={saving || !hasUnsavedChanges}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={onLock} disabled={locking}>
                {locking ? "Locking…" : "Lock"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
