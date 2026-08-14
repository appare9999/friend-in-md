import type {
  AssetBrowseResponse,
  BrowseResponse,
  FileContentResponse,
  FileTreeNode,
  LockEntry,
  LockRequest,
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

export async function fetchTree(): Promise<FileTreeNode[]> {
  const res = await fetch("/api/tree");
  const body = await json<{ tree: FileTreeNode[] }>(res);
  return body.tree;
}

export async function fetchFile(path: string): Promise<FileContentResponse> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
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

export async function pickFolderNative(): Promise<string> {
  const res = await fetch("/api/pick-folder", { method: "POST" });
  const body = await json<{ path: string }>(res);
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

export async function fetchReadme(): Promise<string> {
  const res = await fetch("/api/readme");
  const body = await json<{ content: string }>(res);
  return body.content;
}

export function subscribeEvents(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as ServerEvent);
    } catch {
      // ignore malformed events
    }
  };
  return () => source.close();
}
