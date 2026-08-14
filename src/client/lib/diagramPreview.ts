import mermaid from "mermaid";
import plantumlEncoder from "plantuml-encoder";

mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

interface DiagramEntry {
  svg: string;
  filenameBase: string;
  // Mermaid renders entirely client-side, so its SVG is trustworthy to hand
  // back to the user as-is. PlantUML SVG comes from an external server
  // (plantuml.com / kroki.io) unsanitized, so it's only offered as a
  // rasterized PNG download, never as raw SVG.
  allowSvgDownload: boolean;
}

const diagramRegistry = new Map<string, DiagramEntry>();
const REGISTRY_LIMIT = 200;

function registerDiagram(entry: DiagramEntry): string {
  const id = crypto.randomUUID();
  diagramRegistry.set(id, entry);
  if (diagramRegistry.size > REGISTRY_LIMIT) {
    const oldestKey = diagramRegistry.keys().next().value;
    if (oldestKey !== undefined) diagramRegistry.delete(oldestKey);
  }
  return id;
}

function buildMarkup(id: string): string {
  const entry = diagramRegistry.get(id);
  const svgButton = entry?.allowSvgDownload
    ? `<button type="button" class="diagram-btn" data-action="download-svg">Download SVG</button>`
    : "";
  return (
    `<div class="diagram-preview" data-diagram-id="${id}">` +
    `<div class="diagram-toolbar">` +
    svgButton +
    `<button type="button" class="diagram-btn" data-action="download-png">Download PNG</button>` +
    `<button type="button" class="diagram-btn" data-action="fullscreen">Fullscreen</button>` +
    `</div>` +
    `<div class="diagram-render">${entry?.svg ?? ""}</div>` +
    `</div>`
  );
}

function buildErrorMarkup(message: string): string {
  return `<div class="diagram-preview diagram-preview-error">${escapeHtml(message)}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Debounce per exact (language, content) pair rather than globally: a shared
// timer would cancel one diagram's pending render whenever a *different*
// diagram block re-renders (e.g. several diagrams mounting at once), leaving
// it stuck on the loading placeholder forever.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debounced(key: string, delayMs: number, run: () => void): void {
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    run();
  }, delayMs);
  pendingTimers.set(key, timer);
}

let mermaidCounter = 0;

async function renderMermaid(content: string): Promise<string> {
  const id = `mermaid-diagram-${++mermaidCounter}`;
  const { svg } = await mermaid.render(id, content);
  return svg;
}

async function renderPlantuml(content: string): Promise<string> {
  const encoded = plantumlEncoder.encode(content);
  const res = await fetch(`/api/diagrams/plantuml/svg/${encoded}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `plantuml render failed: ${res.status}`);
  }
  return res.text();
}

export function renderDiagramPreview(
  language: string,
  content: string,
  applyPreview: (value: null | string | HTMLElement) => void
): void | null {
  const lang = language.toLowerCase().trim();
  if (!content.trim()) return null;

  if (lang === "mermaid") {
    debounced(`mermaid:${content}`, 150, () => {
      renderMermaid(content)
        .then((svg) => {
          const id = registerDiagram({ svg, filenameBase: "mermaid-diagram", allowSvgDownload: true });
          applyPreview(buildMarkup(id));
        })
        .catch((err) => applyPreview(buildErrorMarkup(`Mermaid error: ${(err as Error).message}`)));
    });
    return undefined;
  }

  if (lang === "plantuml" || lang === "puml") {
    debounced(`plantuml:${content}`, 300, () => {
      renderPlantuml(content)
        .then((svg) => {
          const id = registerDiagram({ svg, filenameBase: "plantuml-diagram", allowSvgDownload: false });
          applyPreview(buildMarkup(id));
        })
        .catch((err) => applyPreview(buildErrorMarkup(`PlantUML error: ${(err as Error).message}`)));
    });
    return undefined;
  }

  return null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function svgToPngBlob(svgText: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("PNG conversion failed"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize SVG"));
    };
    img.src = url;
  });
}

function triggerDownloadSvg(id: string): void {
  const entry = diagramRegistry.get(id);
  if (!entry) return;
  downloadBlob(new Blob([entry.svg], { type: "image/svg+xml" }), `${entry.filenameBase}.svg`);
}

async function triggerDownloadPng(id: string): Promise<void> {
  const entry = diagramRegistry.get(id);
  if (!entry) return;
  const blob = await svgToPngBlob(entry.svg).catch(() => null);
  if (blob) downloadBlob(blob, `${entry.filenameBase}.png`);
}

function triggerFullscreen(container: HTMLElement): void {
  const target = container.querySelector<HTMLElement>(".diagram-render") ?? container;
  if (document.fullscreenElement === target) {
    document.exitFullscreen();
    return;
  }
  target.requestFullscreen?.();
}

let interactionsInstalled = false;

export function ensureDiagramInteractions(): void {
  if (interactionsInstalled) return;
  interactionsInstalled = true;

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".diagram-btn");
    if (!button) return;

    const container = button.closest<HTMLElement>(".diagram-preview");
    const id = container?.dataset.diagramId;
    if (!id) return;

    if (button.dataset.action === "download-svg") {
      triggerDownloadSvg(id);
    } else if (button.dataset.action === "download-png") {
      triggerDownloadPng(id);
    } else if (button.dataset.action === "fullscreen") {
      triggerFullscreen(container!);
    }
  });
}
