// Pure helpers for the CSV grid: number parsing, sorting, selection stats
// and fill-handle series generation. Kept separate from CsvEditor so the
// spreadsheet-ish logic can be reasoned about without the React plumbing.

export type CsvFillMode = "series" | "copy";

export interface CellPos {
  r: number;
  c: number;
}

export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rangeOf(anchor: CellPos, focus: CellPos): CellRange {
  return {
    top: Math.min(anchor.r, focus.r),
    left: Math.min(anchor.c, focus.c),
    bottom: Math.max(anchor.r, focus.r),
    right: Math.max(anchor.c, focus.c),
  };
}

export function inRange(range: CellRange, r: number, c: number): boolean {
  return r >= range.top && r <= range.bottom && c >= range.left && c <= range.right;
}

export function rangeSize(range: CellRange): number {
  return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

const NUMBER_RE = /^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$|^[+-]?\.\d+$/;

/** Parses "1,280" / "-3.5" / "42" style cells. Anything else (dates, text, blanks) is null. */
export function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!NUMBER_RE.test(trimmed)) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function decimalsOf(value: string): number {
  const trimmed = value.trim();
  const dot = trimmed.indexOf(".");
  return dot === -1 ? 0 : trimmed.length - dot - 1;
}

/** Trims float noise (0.1 + 0.2) for display. */
export function formatNumber(n: number): string {
  return Number(n.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export interface SelectionStats {
  count: number; // non-empty cells
  numericCount: number;
  sum: number;
  average: number;
}

export function selectionStats(rows: string[][], range: CellRange): SelectionStats {
  let count = 0;
  let numericCount = 0;
  let sum = 0;
  for (let r = range.top; r <= range.bottom; r++) {
    for (let c = range.left; c <= range.right; c++) {
      const cell = rows[r]?.[c] ?? "";
      if (cell.trim() === "") continue;
      count++;
      const n = parseNumber(cell);
      if (n !== null) {
        numericCount++;
        sum += n;
      }
    }
  }
  return { count, numericCount, sum, average: numericCount > 0 ? sum / numericCount : 0 };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sorts data rows (everything but the header row 0) by one column. Blanks always go last. */
export function sortRowsByColumn(rows: string[][], column: number, direction: "asc" | "desc"): string[][] {
  const [header, ...body] = rows;
  const sign = direction === "asc" ? 1 : -1;
  const sorted = body
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = a.row[column] ?? "";
      const bv = b.row[column] ?? "";
      const aBlank = av.trim() === "";
      const bBlank = bv.trim() === "";
      if (aBlank || bBlank) return aBlank === bBlank ? a.index - b.index : aBlank ? 1 : -1;
      const an = parseNumber(av);
      const bn = parseNumber(bv);
      const cmp = an !== null && bn !== null ? an - bn : collator.compare(av, bv);
      return cmp !== 0 ? cmp * sign : a.index - b.index;
    })
    .map(({ row }) => row);
  return header ? [header, ...sorted] : sorted;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRAILING_INT_RE = /^(.*?)(\d+)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): number | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function formatIsoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Step of a linear series: 1 for a single seed, otherwise the average gap between seeds. */
function stepOf(values: number[]): number {
  return values.length < 2 ? 1 : (values[values.length - 1] - values[0]) / (values.length - 1);
}

/**
 * Values for `count` cells following `seeds` when dragging the fill handle.
 * In "series" mode numbers, ISO dates and "text + trailing number" (Item 1 ->
 * Item 2) continue as a linear series like Excel; anything else is copied.
 * "copy" mode always repeats the seeds.
 */
export function fillValues(seeds: string[], count: number, mode: CsvFillMode): string[] {
  const copy = () => Array.from({ length: count }, (_, i) => seeds[i % seeds.length]);
  if (mode === "copy" || seeds.length === 0) return copy();

  const numbers = seeds.map(parseNumber);
  if (numbers.every((n): n is number => n !== null)) {
    const step = stepOf(numbers);
    const decimals = Math.max(...seeds.map(decimalsOf), decimalsOf(String(Number(step.toPrecision(12)))));
    const last = numbers[numbers.length - 1];
    return Array.from({ length: count }, (_, i) => (last + step * (i + 1)).toFixed(decimals));
  }

  const dates = seeds.map(parseIsoDate);
  if (dates.every((d): d is number => d !== null)) {
    const step = Math.round(stepOf(dates) / DAY_MS) || 1;
    const last = dates[dates.length - 1];
    return Array.from({ length: count }, (_, i) => formatIsoDate(last + step * (i + 1) * DAY_MS));
  }

  const parts = seeds.map((s) => TRAILING_INT_RE.exec(s));
  if (parts.every((m): m is RegExpExecArray => m !== null) && parts.every((m) => m[1] === parts[0][1])) {
    const prefix = parts[0][1];
    const ints = parts.map((m) => Number(m[2]));
    const width = parts[parts.length - 1][2].length; // keep zero padding (A01 -> A02)
    const step = Math.round(stepOf(ints)) || 1;
    const last = ints[ints.length - 1];
    return Array.from({ length: count }, (_, i) => {
      const n = last + step * (i + 1);
      return prefix + (n < 0 ? String(n) : String(n).padStart(width, "0"));
    });
  }

  return copy();
}
