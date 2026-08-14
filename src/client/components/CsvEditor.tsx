import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
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
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});

  const columnCount = rows[0]?.length ?? 1;

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

  const addRow = () => commit([...rows, Array(columnCount).fill("")]);
  const addColumn = () => commit(rows.map((row) => [...row, ""]));

  const removeRow = (r: number) => {
    if (rows.length <= 1) return;
    commit(rows.filter((_, ri) => ri !== r));
    setSelectedRow(null);
  };

  const deleteSelectedRow = () => {
    if (selectedRow !== null) removeRow(selectedRow);
  };

  const removeColumn = () => {
    if (columnCount <= 1) return;
    commit(rows.map((row) => row.slice(0, columnCount - 1)));
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

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
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

  return (
    <div className="csv-editor" onKeyDown={handleKeyDown}>
      {!readOnly && (
        <div className="csv-toolbar">
          <button onClick={addRow}>+ Row</button>
          <button onClick={addColumn}>+ Column</button>
          <button onClick={removeColumn} disabled={columnCount <= 1}>
            − Column
          </button>
          <button onClick={deleteSelectedRow} disabled={selectedRow === null}>
            Delete row
          </button>
        </div>
      )}
      <div className="csv-grid-wrap">
        <table className="csv-grid">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? "csv-header-row" : undefined}>
                {!readOnly && (
                  <td
                    className={`csv-row-handle ${selectedRow === r ? "selected" : ""}`}
                    onClick={() => setSelectedRow((prev) => (prev === r ? null : r))}
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
    </div>
  );
});
