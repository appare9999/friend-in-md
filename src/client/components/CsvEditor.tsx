import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Papa from "papaparse";
import type { EditorHandle } from "./Editor.js";

interface Props {
  initialValue: string;
  readOnly: boolean;
  onChange: (value: string) => void;
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

interface CsvCellProps {
  value: string;
  readOnly: boolean;
  width: number;
  onChange: (value: string) => void;
}

function CsvCell({ value, readOnly, width, onChange }: CsvCellProps) {
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
    />
  );
}

export const CsvEditor = forwardRef<EditorHandle, Props>(function CsvEditor(
  { initialValue, readOnly, onChange },
  ref
) {
  const [rows, setRows] = useState<string[][]>(() => parseCsv(initialValue));
  const [history, setHistory] = useState<string[][][]>([]);
  const [future, setFuture] = useState<string[][][]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [menu, setMenu] = useState<{ type: "row" | "column"; index: number; top: number; left: number } | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const columnCount = rows[0]?.length ?? 1;

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

  const openRowMenu = (e: ReactMouseEvent<HTMLTableCellElement>, r: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ type: "row", index: r, top: rect.bottom, left: rect.left });
  };

  const openColumnMenu = (e: ReactMouseEvent<HTMLTableCellElement>, c: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ type: "column", index: c, top: rect.bottom, left: rect.left });
  };

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
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const active = document.activeElement as HTMLElement | null;
      const isForeignInput =
        active &&
        active !== document.body &&
        !rootRef.current?.contains(active) &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (isForeignInput) return;
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
  }, [readOnly, rows, history, future]);

  return (
    <div className="csv-editor" ref={rootRef}>
      {!readOnly && (
        <div className="csv-toolbar">
          <button onClick={() => insertRowAt(rows.length)}>+ Row</button>
          <button onClick={() => insertColumnAt(columnCount)}>+ Column</button>
          <span className="csv-toolbar-hint">Click a row/column number to insert or delete</span>
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
                  <td key={c} className="csv-cell">
                    <CsvCell
                      value={cell}
                      readOnly={readOnly}
                      width={columnWidths[c] ?? DEFAULT_COL_WIDTH}
                      onChange={(value) => updateCell(r, c, value)}
                    />
                    {r === 0 && !readOnly && (
                      <div
                        className="col-resize-handle"
                        onMouseDown={(e: ReactMouseEvent) => {
                          e.preventDefault();
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
              <button onClick={() => insertColumnAt(menu.index)}>← Insert column left</button>
              <button onClick={() => insertColumnAt(menu.index + 1)}>→ Insert column right</button>
              <button onClick={() => deleteColumnAt(menu.index)} disabled={columnCount <= 1}>
                ✕ Delete this column
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
