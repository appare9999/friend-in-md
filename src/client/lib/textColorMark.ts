import { $markSchema, $remark } from "@milkdown/kit/utils";

// Milkdown's built-in "html" node treats every raw inline HTML tag as inert
// text (`span.textContent = node.attrs.value` in @milkdown/preset-commonmark),
// which is a sensible default against XSS but means markdown files that color
// text via `<span style="color: red">...</span>` (or the legacy
// `<font color="red">...</font>`) just show the tag source instead of a
// colored word. This plugin recognizes that specific, safe pattern - a
// matching open/close pair around plain inline content - and renders it as
// real colored text instead, while leaving every other raw HTML tag alone.

const SPAN_OPEN_RE = /^<span\s+style\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>$/i;
const SPAN_CLOSE_RE = /^<\/span>$/i;
const FONT_OPEN_RE = /^<font\s+color\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>$/i;
const FONT_CLOSE_RE = /^<\/font>$/i;

function colorFromStyle(style: string): string | null {
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  return match ? match[1].trim() : null;
}

interface MdastNode {
  type: string;
  value?: string;
  color?: string;
  children?: MdastNode[];
  [key: string]: unknown;
}

function matchOpen(raw: string): { color: string; isSpan: boolean } | null {
  const spanMatch = SPAN_OPEN_RE.exec(raw);
  if (spanMatch) {
    const color = colorFromStyle(spanMatch[1] ?? spanMatch[2] ?? "");
    return color ? { color, isSpan: true } : null;
  }
  const fontMatch = FONT_OPEN_RE.exec(raw);
  if (fontMatch) {
    const color = (fontMatch[1] ?? fontMatch[2] ?? "").trim();
    return color ? { color, isSpan: false } : null;
  }
  return null;
}

function transformChildren(children: MdastNode[]): MdastNode[] {
  const result: MdastNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type === "html" && typeof node.value === "string") {
      const open = matchOpen(node.value.trim());
      if (open) {
        const closeRe = open.isSpan ? SPAN_CLOSE_RE : FONT_CLOSE_RE;
        let depth = 0;
        let closeIndex = -1;
        for (let j = i + 1; j < children.length; j++) {
          const sibling = children[j];
          if (sibling.type === "html" && typeof sibling.value === "string") {
            const raw = sibling.value.trim();
            if (matchOpen(raw)?.isSpan === open.isSpan) depth++;
            else if (closeRe.test(raw)) {
              if (depth === 0) {
                closeIndex = j;
                break;
              }
              depth--;
            }
          }
        }
        if (closeIndex !== -1) {
          const inner = children.slice(i + 1, closeIndex);
          result.push({
            type: "textColor",
            color: open.color,
            tag: open.isSpan ? "span" : "font",
            children: transformChildren(inner),
          });
          i = closeIndex;
          continue;
        }
      }
    }
    if (Array.isArray(node.children)) node.children = transformChildren(node.children);
    result.push(node);
  }
  return result;
}

function remarkTextColorAttacher(this: { data: (key: string) => unknown[] | undefined } & { data: (key: string, value?: unknown) => unknown }) {
  const toMarkdownExtensions = (this.data("toMarkdownExtensions") as unknown[] | undefined) ?? [];
  toMarkdownExtensions.push({
    handlers: {
      textColor(
        node: MdastNode,
        _parent: unknown,
        state: {
          enter: (name: string) => () => void;
          containerPhrasing: (node: MdastNode, info: Record<string, unknown>) => string;
        },
        info: Record<string, unknown>
      ) {
        const exit = state.enter("textColor");
        const value = state.containerPhrasing(node, { before: "", after: "", ...info });
        exit();
        return node.tag === "font"
          ? `<font color="${node.color}">${value}</font>`
          : `<span style="color: ${node.color}">${value}</span>`;
      },
    },
  });
  this.data("toMarkdownExtensions", toMarkdownExtensions);

  return ((tree: MdastNode) => {
    if (Array.isArray(tree.children)) tree.children = transformChildren(tree.children);
  }) as (tree: unknown) => void;
}

export const remarkTextColorPlugin = $remark("remarkTextColor", () => remarkTextColorAttacher);

export const textColorSchema = $markSchema("textColor", () => ({
  attrs: { color: { default: "" }, tag: { default: "span" } },
  parseDOM: [
    {
      style: "color",
      getAttrs: (value: string) => ({ color: value, tag: "span" }),
    },
  ],
  toDOM: (mark) => ["span", { style: `color: ${mark.attrs.color}` }, 0],
  parseMarkdown: {
    match: (node) => node.type === "textColor",
    runner: (state, node, markType) => {
      state.openMark(markType, { color: node.color as string, tag: (node.tag as string) ?? "span" });
      state.next(node.children as never);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "textColor",
    runner: (state, mark) => {
      state.withMark(mark, "textColor", undefined, { color: mark.attrs.color, tag: mark.attrs.tag });
    },
  },
}));
