// Fullscreen image viewer with zoom/pan. Opened by double-clicking an image
// inside the editor. Built as plain DOM (like diagramPreview) because the
// images live inside Milkdown's own component tree, not React.

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;
const ZOOM_STEP = 1.25;

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

function openImageViewer(src: string, alt: string): void {
  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  overlay.tabIndex = -1;
  overlay.innerHTML =
    `<div class="image-viewer-stage"><img class="image-viewer-img" draggable="false" /></div>` +
    `<div class="image-viewer-toolbar">` +
    `<button type="button" data-action="zoom-out" title="縮小 (-)">−</button>` +
    `<span class="image-viewer-scale">100%</span>` +
    `<button type="button" data-action="zoom-in" title="拡大 (+)">+</button>` +
    `<button type="button" data-action="actual" title="原寸 (1)">1:1</button>` +
    `<button type="button" data-action="fit" title="画面に合わせる (0)">Fit</button>` +
    `<button type="button" data-action="close" title="閉じる (Esc)">✕</button>` +
    `</div>`;

  const stage = overlay.querySelector<HTMLElement>(".image-viewer-stage")!;
  const img = overlay.querySelector<HTMLImageElement>(".image-viewer-img")!;
  const scaleLabel = overlay.querySelector<HTMLElement>(".image-viewer-scale")!;
  img.src = src;
  img.alt = alt;

  const view: ViewState = { scale: 1, x: 0, y: 0 };

  const apply = () => {
    img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    scaleLabel.textContent = `${Math.round(view.scale * 100)}%`;
  };

  // Centers the image at the given scale.
  const center = (scale: number) => {
    const rect = stage.getBoundingClientRect();
    view.scale = scale;
    view.x = (rect.width - img.naturalWidth * scale) / 2;
    view.y = (rect.height - img.naturalHeight * scale) / 2;
    apply();
  };

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    if (!img.naturalWidth || !img.naturalHeight) return;
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight, 1);
    center(scale);
  };

  // Zooms keeping the stage point (px, py) fixed on screen.
  const zoomAt = (factor: number, px: number, py: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const ratio = next / view.scale;
    view.x = px - (px - view.x) * ratio;
    view.y = py - (py - view.y) * ratio;
    view.scale = next;
    apply();
  };

  const zoomAtCenter = (factor: number) => {
    const rect = stage.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    window.removeEventListener("resize", onResize);
    if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
    overlay.remove();
  };

  const onFullscreenChange = () => {
    // Leaving browser fullscreen (e.g. via Esc) closes the viewer too.
    if (document.fullscreenElement !== overlay) close();
  };

  const onResize = () => fit();

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  let drag: { startX: number; startY: number; originX: number; originY: number } | null = null;
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag) return;
    view.x = drag.originX + event.clientX - drag.startX;
    view.y = drag.originY + event.clientY - drag.startY;
    apply();
  });
  const endDrag = () => {
    drag = null;
    stage.classList.remove("dragging");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("dblclick", (event) => {
    const rect = stage.getBoundingClientRect();
    if (Math.abs(view.scale - 1) < 0.01) fit();
    else zoomAt(1 / view.scale, event.clientX - rect.left, event.clientY - rect.top);
  });

  overlay.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button[data-action]");
    if (!button) return;
    switch (button.dataset.action) {
      case "zoom-in": zoomAtCenter(ZOOM_STEP); break;
      case "zoom-out": zoomAtCenter(1 / ZOOM_STEP); break;
      case "actual": center(1); break;
      case "fit": fit(); break;
      case "close": close(); break;
    }
  });

  overlay.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "Escape": close(); break;
      case "+": case "=": zoomAtCenter(ZOOM_STEP); break;
      case "-": case "_": zoomAtCenter(1 / ZOOM_STEP); break;
      case "0": fit(); break;
      case "1": center(1); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  document.body.appendChild(overlay);
  overlay.focus();
  if (img.complete) fit();
  else img.addEventListener("load", fit, { once: true });

  window.addEventListener("resize", onResize);
  overlay.requestFullscreen?.()
    .then(() => document.addEventListener("fullscreenchange", onFullscreenChange))
    .catch(() => {
      // Fullscreen API refused - the overlay still covers the window.
    });
}

let installed = false;

export function ensureImageViewer(): void {
  if (installed) return;
  installed = true;

  document.addEventListener("dblclick", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".milkdown")) return;
    // Once the first click selects an image block, Milkdown routes the second
    // click to the surrounding wrapper, so the dblclick target is often not
    // the <img> itself.
    const img =
      target instanceof HTMLImageElement
        ? target
        : target
            .closest(".milkdown-image-block, .milkdown-image-inline")
            ?.querySelector<HTMLImageElement>("img");
    if (!img?.src) return;
    event.preventDefault();
    event.stopPropagation();
    openImageViewer(img.src, img.alt);
  }, true);
}
