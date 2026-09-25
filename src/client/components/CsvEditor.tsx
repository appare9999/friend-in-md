import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Papa from "papaparse";
import type { EditorHandle } from "./Editor.js";
import {
  fillValues,
  formatNumber,
  inRange,
  rangeOf,
  rangeSize,
  selectionStats,
  sortRowsByColumn,
} from "../lib/csvGrid.js";
import type { CellPos, CellRange, CsvFillMode } from "../lib/csvGrid.js";

interface Props {
  initialValue: string;
  readOnly: boolean;
  fillMode: CsvFillMode;
  onChange: (value: string) => void;
}

interface Selection {
  anchor: CellPos;
  focus: CellPos;
}

interface FillPreview {
  direction: "down" | "right";
  to: number; // last row (down) or column (right) the fill reaches
}

const DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 60;

function normalize(rows: string[][]): string[][] {
  const width = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((row) => {
    if (row.length === width) return row;
    const padded = row.slice();
    while (padded.length < width) padded.push("");
    return padded;
  });
}

function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = result.data.filter((row) => row.length > 0);
  return normalize(rows.length > 0 ? rows : [[""]]);
}

function columnLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function cellFromPoint(x: number, y: number): CellPos | null {
  const td = document.elementFromPoint(x, y)?.closest<HTMLElement>("td[data-r]");
  if (!td) return null;
  return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
}

function fillRange(range: CellRange, preview: FillPreview): CellRange {
  return preview.direction === "down"
    ? { ...range, top: range.bottom + 1, bottom: preview.to }
    : { ...range, left: range.right + 1, right: preview.to };
}

interface CsvCellProps {
  value: string;
  readOnly: boolean;
  width: number;
  onChange: (value: string) => void;
  onFocus: () => void;
}

function CsvCell({ value, readOnly, width, onChange, onFocus }: CsvCellProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, width]);

  return (
    <textarea
      ref={ref}
      className="csv-cell-input"
      style={{ width }}
      rows={1}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
    />
  );
}

export const CsvEditor = forwardRef<EditorHandle, Props>(function CsvEditor(
  { initialValue, readOnly, fillMode, onChange },
  ref
) {
  const [rows, setRows] = useState<string[][]>(() => parseCsv(initialValue));
  const [history, setHistory] = useState<string[][][]>([]);
  const [future, setFuture] = useState<string[][][]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [menu, setMenu] = useState<{ type: "row" | "column"; index: number; top: number; left: number } | null>(
    null
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [fillPreview, setFillPreview] = useState<FillPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Set while a mouse drag (range select or fill handle) is in progress, so a
  // textarea's onFocus doesn't collapse the range being built.
  const dragKindRef = useRef<"select" | "fill" | null>(null);

  const columnCount = rows[0]?.length ?? 1;
  const range = selection ? rangeOf(selection.anchor, selection.focus) : null;
  const isMulti = !!range && rangeSize(range) > 1;
  const previewRange = range && fillPreview ? fillRange(range, fillPreview) : null;
  const stats = useMemo(() => (range && isMulti ? selectionStats(rows, range) : null), [rows, range?.top, range?.left, range?.bottom, range?.right, isMulti]);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [menu]);

  const commit = (next: string[][]) => {
    const normalized = normalize(next);
    setHistory([...history, rows]);
    setFuture([]);
    setRows(normalized);
    onChange(Papa.unparse(normalized));
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture([rows, ...future]);
    setHistory(history.slice(0, -1));
    setRows(previous);
    onChange(Papa.unparse(previous));
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory([...history, rows]);
    setFuture(future.slice(1));
    setRows(next);
    onChange(Papa.unparse(next));
  };

  useImperativeHandle(ref, () => ({ undo, redo }));

  const updateCell = (r: number, c: number, value: string) => {
    if (isMulti) setSelection({ anchor: { r, c }, focus: { r, c } });
    commit(rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)));
  };

  const insertRowAt = (index: number) => {
    const next = rows.slice();
    next.splice(index, 0, Array(columnCount).fill(""));
    commit(next);
    setMenu(null);
  };

  const insertColumnAt = (index: number) => {
    commit(
      rows.map((row) => {
        const next = row.slice();
        next.splice(index, 0, "");
        return next;
      })
    );
    setMenu(null);
  };

  const deleteRowAt = (index: number) => {
    if (rows.length > 1) commit(rows.filter((_, ri) => ri !== index));
    setMenu(null);
  };

  const deleteColumnAt = (index: number) => {
    if (columnCount > 1) commit(rows.map((row) => row.filter((_, ci) => ci !== index)));
    setMenu(null);
  };

  const sortByColumn = (index: number, direction: "asc" | "desc") => {
    commit(sortRowsByColumn(rows, index, direction));
    setSelection(null);
    setMenu(null);
  };

  const openRowMenu = (e: ReactMouseEvent<HTMLTableCellElement>, r: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ type: "row", index: r, top: rect.bottom, left: rect.left });
    setSelection({ anchor: { r, c: 0 }, focus: { r, c: columnCount - 1 } });
  };

  const openColumnMenu = (e: ReactMouseEvent<HTMLTableCellElement>, c: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ type: "column", index: c, top: rect.bottom, left: rect.left });
    setSelection({ anchor: { r: 0, c }, focus: { r: rows.length - 1, c } });
  };

  const selectedGrid = (): string[][] => {
    if (!range) return [];
    return rows.slice(range.top, range.bottom + 1).map((row) => row.slice(range.left, range.right + 1));
  };

  const clearSelectedCells = () => {
    if (!range) return;
    commit(rows.map((row, r) => row.map((cell, c) => (inRange(range, r, c) ? "" : cell))));
  };

  // Writes a pasted block at the selection's top-left, growing the grid if it
  // runs past the last row/column. A single value pasted over a multi-cell
  // selection fills every selected cell instead (Excel behaviour).
  const pasteGrid = (grid: string[][]) => {
    if (!range) return;
    if (grid.length === 1 && grid[0].length === 1) {
      const value = grid[0][0];
      commit(rows.map((row, r) => row.map((cell, c) => (inRange(range, r, c) ? value : cell))));
      return;
    }
    const next = rows.map((row) => row.slice());
    const height = grid.length;
    const width = Math.max(...grid.map((g) => g.length));
    while (next.length < range.top + height) next.push([]);
    grid.forEach((line, dr) => {
      const row = next[range.top + dr];
      while (row.length < range.left + width) row.push("");
      line.forEach((value, dc) => {
        row[range.left + dc] = value;
      });
    });
    commit(next);
    setSelection({
      anchor: { r: range.top, c: range.left },
      focus: { r: range.top + height - 1, c: range.left + width - 1 },
    });
  };

  const applyFill = (preview: FillPreview, toggleMode: boolean) => {
    if (!range) return;
    const mode: CsvFillMode = toggleMode ? (fillMode === "series" ? "copy" : "series") : fillMode;
    const target = fillRange(range, preview);
    const next = rows.map((row) => row.slice());
    if (preview.direction === "down") {
      const count = target.bottom - target.top + 1;
      for (let c = range.left; c <= range.right; c++) {
        const seeds = rows.slice(range.top, range.bottom + 1).map((row) => row[c]);
        fillValues(seeds, count, mode).forEach((value, i) => {
          next[target.top + i][c] = value;
        });
      }
    } else {
      const count = target.right - target.left + 1;
      for (let r = range.top; r <= range.bottom; r++) {
        const seeds = rows[r].slice(range.left, range.right + 1);
        fillValues(seeds, count, mode).forEach((value, i) => {
          next[r][target.left + i] = value;
        });
      }
    }
    commit(next);
    setSelection({ anchor: selection!.anchor, focus: { r: target.bottom, c: target.right } });
  };

  // Window-level drag listeners call through this ref so they always see the
  // current rows/selection/history instead of the render they were attached in.
  const latestRef = useRef({ range, isMulti, selectedGrid, clearSelectedCells, pasteGrid, applyFill });
  latestRef.current = { range, isMulti, selectedGrid, clearSelectedCells, pasteGrid, applyFill };

  const startDrag = (kind: "select" | "fill") => {
    dragKindRef.current = kind;
    setDragging(true);
    let preview: FillPreview | null = null;
    const onMove = (e: globalThis.MouseEvent) => {
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      if (kind === "select") {
        setSelection((sel) => {
          if (!sel || (sel.focus.r === cell.r && sel.focus.c === cell.c)) return sel;
          // Leaving the start cell turns this into a range drag: drop the
          // textarea's focus so the browser stops extending a text selection.
          const active = document.activeElement as HTMLElement | null;
          if (active && rootRef.current?.contains(active)) active.blur();
          return { anchor: sel.anchor, focus: cell };
        });
        return;
      }
      const current = latestRef.current.range;
      if (!current) return;
      const down = cell.r - current.bottom;
      const right = cell.c - current.right;
      preview =
        down > 0 && down >= right
          ? { direction: "down", to: cell.r }
          : right > 0
            ? { direction: "right", to: cell.c }
            : null;
      setFillPreview(preview);
    };
    const onUp = (e: globalThis.MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragKindRef.current = null;
      setDragging(false);
      if (kind === "fill" && preview) latestRef.current.applyFill(preview, e.ctrlKey || e.metaKey);
      setFillPreview(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onCellMouseDown = (e: ReactMouseEvent<HTMLTableCellElement>, r: number, c: number) => {
    if (e.button !== 0) return;
    if (e.shiftKey && selection) {
      e.preventDefault();
      setSelection({ anchor: selection.anchor, focus: { r, c } });
      return;
    }
    setSelection({ anchor: { r, c }, focus: { r, c } });
    startDrag("select");
  };

  const onCellFocus = (r: number, c: number) => {
    if (dragKindRef.current) return;
    setSelection((sel) =>
      sel && rangeSize(rangeOf(sel.anchor, sel.focus)) > 1 && inRange(rangeOf(sel.anchor, sel.focus), r, c)
        ? sel
        : { anchor: { r, c }, focus: { r, c } }
    );
  };

  // Copy/cut/paste are handled at the document level so they also work after
  // a range drag, which blurs the cell textarea (focus falls back to body).
  // A single cell with a partial text selection keeps the textarea's native
  // behaviour; otherwise whole cells go to/from the clipboard as TSV, which
  // is what Excel and Google Sheets exchange.
  useEffect(() => {
    const ownsFocus = () => {
      const active = document.activeElement;
      return !active || active === document.body || !!rootRef.current?.contains(active);
    };
    const hasTextSelection = () => {
      const active = document.activeElement;
      return active instanceof HTMLTextAreaElement && active.selectionStart !== active.selectionEnd;
    };
    const onCopyOrCut = (e: ClipboardEvent) => {
      const { range, isMulti, selectedGrid, clearSelectedCells } = latestRef.current;
      if (!range || !ownsFocus() || !e.clipboardData) return;
      if (!isMulti && hasTextSelection()) return;
      const grid = selectedGrid();
      const text = isMulti ? Papa.unparse(grid, { delimiter: "\t", newline: "\r\n" }) : (grid[0]?.[0] ?? "");
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
      if (e.type === "cut" && !readOnly) clearSelectedCells();
    };
    const onPaste = (e: ClipboardEvent) => {
      const { range, isMulti, pasteGrid } = latestRef.current;
      if (readOnly || !range || !ownsFocus() || !e.clipboardData) return;
      const text = e.clipboardData.getData("text/plain");
      const parsed = Papa.parse<string[]>(text.replace(/\r?\n$/, ""), { delimiter: "\t" }).data;
      const grid = parsed.length > 0 ? parsed : [[""]];
      const single = grid.length === 1 && grid[0].length === 1;
      // Plain text into one focused cell: let the textarea insert it at the caret.
      if (single && !isMulti && document.activeElement instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      pasteGrid(single ? [[text]] : grid);
    };
    document.addEventListener("copy", onCopyOrCut);
    document.addEventListener("cut", onCopyOrCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopyOrCut);
      document.removeEventListener("cut", onCopyOrCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [readOnly]);

  const startResize = (colIndex: number, startX: number) => {
    const startWidth = columnWidths[colIndex] ?? DEFAULT_COL_WIDTH;
    const onMove = (e: globalThis.MouseEvent) => {
      const delta = e.clientX - startX;
      setColumnWidths((widths) => ({
        ...widths,
        [colIndex]: Math.max(MIN_COL_WIDTH, startWidth + delta),
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Window-level (not just the container's onKeyDown) so Ctrl+Z/Ctrl+Y work
  // even when nothing inside the grid is focused yet (e.g. right after
  // opening the file, or after clicking a row/column handle, which isn't
  // itself focusable) - a container-scoped listener only sees keydowns that
  // bubble up from a focused descendant.
  useEffect(() => {
    if (readOnly) return;
    const onWindowKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setSelection((sel) => (sel ? { anchor: sel.anchor, focus: sel.anchor } : sel));
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const isForeignInput =
        active &&
        active !== document.body &&
        !rootRef.current?.contains(active) &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (isForeignInput) return;
      if ((e.key === "Delete" || e.key === "Backspace") && isMulti) {
        e.preventDefault();
        clearSelectedCells();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [readOnly, rows, history, future, isMulti, range?.top, range?.left, range?.bottom, range?.right]);

  return (
    <div className={`csv-editor ${dragging ? "csv-dragging" : ""}`} ref={rootRef}>
      {!readOnly && (
        <div className="csv-toolbar">
          <button onClick={() => insertRowAt(rows.length)}>+ Row</button>
          <button onClick={() => insertColumnAt(columnCount)}>+ Column</button>
          <span className="csv-toolbar-hint">
            Click a row/column number to insert, delete or sort · drag the corner square to fill{" "}
            {fillMode === "series" ? "a series" : "copies"} (Ctrl to switch)
          </span>
        </div>
      )}
      <div className="csv-grid-wrap">
        <table className="csv-grid">
          {!readOnly && (
            <thead>
              <tr className="csv-column-handle-row">
                <td className="csv-row-handle-spacer" />
                {(rows[0] ?? []).map((_, c) => (
                  <td
                    key={c}
                    className={`csv-column-handle ${menu?.type === "column" && menu.index === c ? "active" : ""}`}
                    onClick={(e) => openColumnMenu(e, c)}
                  >
                    {columnLabel(c)}
                  </td>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? "csv-header-row" : undefined}>
                {!readOnly && (
                  <td
                    className={`csv-row-handle ${menu?.type === "row" && menu.index === r ? "active" : ""}`}
                    onClick={(e) => openRowMenu(e, r)}
                  >
                    {r + 1}
                  </td>
                )}
                {row.map((cell, c) => (
                  <td
                    key={c}
                    data-r={r}
                    data-c={c}
                    className={[
                      "csv-cell",
                      isMulti && inRange(range, r, c) ? "selected" : "",
                      previewRange && inRange(previewRange, r, c) ? "fill-preview" : "",
                    ].join(" ")}
                    onMouseDown={(e) => onCellMouseDown(e, r, c)}
                  >
                    <CsvCell
                      value={cell}
                      readOnly={readOnly}
                      width={columnWidths[c] ?? DEFAULT_COL_WIDTH}
                      onChange={(value) => updateCell(r, c, value)}
                      onFocus={() => onCellFocus(r, c)}
                    />
                    {!readOnly && range && r === range.bottom && c === range.right && (
                      <div
                        className="csv-fill-handle"
                        title="Drag to fill (hold Ctrl to switch series/copy)"
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          startDrag("fill");
                        }}
                      />
                    )}
                    {r === 0 && !readOnly && (
                      <div
                        className="col-resize-handle"
                        onMouseDown={(e: ReactMouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startResize(c, e.clientX);
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menu && (
        <div ref={menuRef} className="csv-context-menu" style={{ top: menu.top, left: menu.left }}>
          {menu.type === "row" ? (
            <>
              <button onClick={() => insertRowAt(menu.index)}>↑ Insert row above</button>
              <button onClick={() => insertRowAt(menu.index + 1)}>↓ Insert row below</button>
              <button onClick={() => deleteRowAt(menu.index)} disabled={rows.length <= 1}>
                ✕ Delete this row
              </button>
            </>
          ) : (
            <>
              <button onClick={() => sortByColumn(menu.index, "asc")} disabled={rows.length <= 2}>
                ▲ Sort ascending
              </button>
              <button onClick={() => sortByColumn(menu.index, "desc")} disabled={rows.length <= 2}>
                ▼ Sort descending
              </button>
              <div className="csv-context-menu-separator" />
              <button onClick={() => insertColumnAt(menu.index)}>← Insert column left</button>
              <button onClick={() => insertColumnAt(menu.index + 1)}>→ Insert column right</button>
              <button onClick={() => deleteColumnAt(menu.index)} disabled={columnCount <= 1}>
                ✕ Delete this column
              </button>
            </>
          )}
        </div>
      )}
      {stats && (
        <div className="csv-status-bar">
          {stats.numericCount > 0 && (
            <>
              <span>Average: {formatNumber(stats.average)}</span>
              <span>Sum: {formatNumber(stats.sum)}</span>
            </>
          )}
          <span>Count: {stats.count}</span>
        </div>
      )}
    </div>
  );
});
