export type FileKind = "markdown" | "csv";

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

export type ServerEvent =
  | { type: "tree-changed" }
  | { type: "file-changed"; path: string }
  | { type: "lock-changed"; path: string; lock: LockEntry }
  | { type: "root-changed"; status: RootStatus };
