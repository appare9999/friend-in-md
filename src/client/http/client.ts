import type {
  AssetBrowseResponse,
  BrowseResponse,
  FileContentResponse,
  FileTreeNode,
  LockEntry,
  LockRequest,
  PickQuickNoteFolderResponse,
  QuickNoteContentResponse,
  QuickNoteFolderResponse,
  QuickNoteListResponse,
  RootStatus,
  SearchResponse,
  ServerEvent,
  UnlockRequest,
} from "@shared/types.js";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTree(csvLimitBytes?: number): Promise<FileTreeNode[]> {
  const qs = csvLimitBytes ? `?csvLimit=${csvLimitBytes}` : "";
  const res = await fetch(`/api/tree${qs}`);
  const body = await json<{ tree: FileTreeNode[] }>(res);
  return body.tree;
}

export async function fetchFile(path: string, csvLimitBytes?: number): Promise<FileContentResponse> {
  const qs = csvLimitBytes ? `&csvLimit=${csvLimitBytes}` : "";
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}${qs}`);
  return json<FileContentResponse>(res);
}

export async function saveFile(path: string, content: string): Promise<void> {
  const res = await fetch("/api/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  await json(res);
}

export async function lockFile(req: LockRequest): Promise<{ lock: LockEntry }> {
  const res = await fetch("/api/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return json(res);
}

export async function unlockFile(req: UnlockRequest): Promise<{ lock: LockEntry }> {
  const res = await fetch("/api/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return json(res);
}

export async function fetchRootStatus(): Promise<RootStatus> {
  const res = await fetch("/api/root");
  return json<RootStatus>(res);
}

export async function setRoot(path: string): Promise<RootStatus> {
  const res = await fetch("/api/root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return json<RootStatus>(res);
}

export async function browse(path?: string): Promise<BrowseResponse> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : "";
  const res = await fetch(`/api/browse${qs}`);
  return json<BrowseResponse>(res);
}

// Resolves to null when the user closed the dialog without picking a folder
// (not an error) - and still throws if no native dialog is available at all.
export async function pickFolderNative(): Promise<string | null> {
  const res = await fetch("/api/pick-folder", { method: "POST" });
  const body = await json<{ path: string | null }>(res);
  return body.path;
}

export async function searchFiles(query: string): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  return json<SearchResponse>(res);
}

export async function browseAssets(path?: string): Promise<AssetBrowseResponse> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : "";
  const res = await fetch(`/api/assets${qs}`);
  return json<AssetBrowseResponse>(res);
}

export function assetUrl(path: string): string {
  return `/api/asset?path=${encodeURIComponent(path)}`;
}

export function exportPptxUrl(path: string): string {
  return `/api/export/pptx?path=${encodeURIComponent(path)}`;
}

export async function setMarpTheme(path: string, theme: string): Promise<void> {
  const res = await fetch("/api/marp-theme", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, theme }),
  });
  await json(res);
}

export interface CustomMarpTheme {
  name: string;
  fileName: string;
}

export interface MarpThemesResponse {
  builtin: string[];
  custom: CustomMarpTheme[];
}

export async function fetchMarpThemes(): Promise<MarpThemesResponse> {
  const res = await fetch("/api/marp-themes");
  return json<MarpThemesResponse>(res);
}

export async function fetchMarpThemeCss(fileName: string): Promise<string> {
  const res = await fetch(`/api/marp-theme-css?name=${encodeURIComponent(fileName)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.text();
}

export async function fetchReadme(): Promise<string> {
  const res = await fetch("/api/readme");
  const body = await json<{ content: string }>(res);
  return body.content;
}

export async function fetchQuickNotes(): Promise<QuickNoteListResponse> {
  const res = await fetch("/api/quick-notes");
  return json<QuickNoteListResponse>(res);
}

export async function fetchQuickNoteFolder(): Promise<QuickNoteFolderResponse> {
  const res = await fetch("/api/quick-note-folder");
  return json<QuickNoteFolderResponse>(res);
}

export async function setQuickNoteFolder(folder: string | null): Promise<QuickNoteFolderResponse> {
  const res = await fetch("/api/quick-note-folder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  return json<QuickNoteFolderResponse>(res);
}

export async function pickQuickNoteFolder(): Promise<PickQuickNoteFolderResponse> {
  const res = await fetch("/api/quick-note-folder/pick", { method: "POST" });
  return json<PickQuickNoteFolderResponse>(res);
}

export async function fetchQuickNoteContent(path: string): Promise<QuickNoteContentResponse> {
  const res = await fetch(`/api/quick-note-content?path=${encodeURIComponent(path)}`);
  return json<QuickNoteContentResponse>(res);
}

const EVENTS_RETRY_MS = 2000;

// onReconnect fires whenever the stream comes back after dropping (e.g. the
// server restarted), since events sent meanwhile were missed. EventSource
// only retries on its own after a network error - a non-200 reply (the Vite
// dev proxy answers 5xx while the API server is down) closes it for good -
// so reconnection is handled here instead.
export function subscribeEvents(
  onEvent: (event: ServerEvent) => void,
  onReconnect?: () => void
): () => void {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectedBefore = false;
  let stopped = false;

  const connect = () => {
    source = new EventSource("/api/events");
    source.onopen = () => {
      if (connectedBefore) onReconnect?.();
      connectedBefore = true;
    };
    source.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data) as ServerEvent);
      } catch {
        // ignore malformed events
      }
    };
    source.onerror = () => {
      source?.close();
      if (stopped || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!stopped) connect();
      }, EVENTS_RETRY_MS);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}
