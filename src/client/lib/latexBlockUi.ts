// LaTeX fenced blocks reuse Crepe's generic CodeMirror code-block component,
// which has no per-language config hook - so there's no supported way to
// drop its language picker only for "latex" blocks. This tags matching
// blocks with a class so CSS can hide just that control (the Hide/Edit
// preview toggle stays - it's the only way to show/hide LaTeX source).
const LATEX_CLASS = "latex-code-block";

function markLatexBlocks(): void {
  document.querySelectorAll<HTMLElement>(".milkdown-code-block").forEach((block) => {
    if (block.classList.contains(LATEX_CLASS)) return;
    const lang = block.querySelector(".language-button")?.textContent?.trim().toLowerCase();
    if (lang === "latex") block.classList.add(LATEX_CLASS);
  });
}

let installed = false;
let scheduled = false;

function scheduleMark(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    markLatexBlocks();
  });
}

export function ensureLatexCodeBlockMarking(): void {
  if (installed) return;
  installed = true;
  scheduleMark();
  new MutationObserver(scheduleMark).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
