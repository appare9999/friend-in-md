export type FileKind = "markdown" | "csv";

// CSV is rendered as an in-memory grid of editable DOM cells, which doesn't
// scale the way a text/WYSIWYG editor does - files past the configured limit
// are blocked from opening instead. The limit is user-adjustable (Settings),
// bounded by MIN/MAX below, and enforced server-side on every request.
export const DEFAULT_CSV_LIMIT_BYTES = 500 * 1024; // 500 KB
export const MIN_CSV_LIMIT_BYTES = 100 * 1024; // 100 KB
export const MAX_CSV_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileTreeNode {
  name: string;
  path: string; // posix-style, relative to the served root
  type: "dir" | "file";
  children?: FileTreeNode[];
  locked?: boolean;
  fileKind?: FileKind;
  tooLarge?: boolean; // csv only - exceeds the size limit, opening is blocked
}

export interface LockEntry {
  locked: boolean;
  lockedAt: string | null;
}

export type LockState = Record<string, LockEntry>;

export interface FileContentResponse {
  path: string;
  content: string;
  lock: LockEntry;
}

export interface SaveFileRequest {
  path: string;
  content: string;
}

export interface LockRequest {
  path: string;
}

export interface UnlockRequest {
  path: string;
}

export interface RootStatus {
  root: string | null;
}

export interface SetRootRequest {
  path: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface AssetEntry {
  name: string;
  path: string; // posix-style, relative to the served root
  isDir: boolean;
}

export interface AssetBrowseResponse {
  path: string; // posix-style, relative to the served root ("" for root)
  parent: string | null; // posix-style, relative to the served root
  entries: AssetEntry[];
}

export interface SearchMatch {
  line: number;
  text: string;
}

export interface SearchResultItem {
  path: string;
  nameMatch: boolean;
  matches: SearchMatch[];
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

export interface QuickNoteSummary {
  path: string;
  title: string;
}

export interface QuickNoteListResponse {
  notes: QuickNoteSummary[];
  // Whether a quick-note folder is configured at all - independent of
  // whether a vault root is currently open.
  folderOpen: boolean;
}

export interface QuickNoteFolderResponse {
  // Absolute path to scan for `quick: true` notes, or null if unset. Set
  // independently of (and persisted separately from) the open vault root.
  folder: string | null;
}

export interface PickQuickNoteFolderResponse {
  // Present (and non-null) only when the user actually picked a folder.
  // `cancelled: true` means the dialog was closed without picking one - the
  // previously configured folder (if any) is left untouched.
  folder: string | null;
  cancelled?: boolean;
}

export interface QuickNoteContentResponse {
  content: string;
}

export type ServerEvent =
  | { type: "tree-changed" }
  | { type: "file-changed"; path: string }
  | { type: "lock-changed"; path: string; lock: LockEntry }
  | { type: "root-changed"; status: RootStatus };
