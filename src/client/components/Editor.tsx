import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commandsCtx } from "@milkdown/kit/core";
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { insertImageCommand } from "@milkdown/kit/preset/commonmark";
import { ensureDiagramInteractions, renderDiagramPreview } from "../lib/diagramPreview.js";
import { ensureLatexCodeBlockMarking } from "../lib/latexBlockUi.js";
import { assetUrl } from "../http/client.js";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "katex/dist/katex.min.css";

ensureDiagramInteractions();
ensureLatexCodeBlockMarking();

export interface EditorHandle {
  undo: () => void;
  redo: () => void;
  insertImage?: (relativeSrc: string, alt?: string) => void;
  scrollToHeading?: (index: number) => void;
}

interface Props {
  initialValue: string;
  readOnly: boolean;
  filePath: string;
  onChange: (value: string) => void;
}

// Resolves a markdown image src (which may be relative, e.g. "../assets/x.png")
// against the directory of the note that contains it, producing a vault-root-relative
// posix path. The URL API's relative-resolution handles ".."/"." segments for us.
function resolveVaultPath(noteDir: string, relUrl: string): string {
  const base = `http://vault/${noteDir ? `${noteDir}/` : ""}`;
  const resolved = new URL(relUrl, base).pathname;
  return decodeURIComponent(resolved).replace(/^\//, "");
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

const CrepeEditor = forwardRef<EditorHandle, Props>(function CrepeEditor(
  { initialValue, readOnly, filePath, onChange },
  ref
) {
  const crepeRef = useRef<Crepe | null>(null);
  const rootElRef = useRef<HTMLElement | null>(null);
  const noteDir = dirOf(filePath);

  useEditor((root) => {
    rootElRef.current = root;
    const crepe = new Crepe({
      root,
      defaultValue: initialValue,
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          renderPreview: renderDiagramPreview,
        },
        [Crepe.Feature.ImageBlock]: {
          proxyDomURL: (url: string) => {
            if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
            return assetUrl(resolveVaultPath(noteDir, url));
          },
        },
      },
    });
    crepe.setReadonly(readOnly);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) onChange(markdown);
      });
    });
    crepeRef.current = crepe;
    return crepe;
  }, []);

  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  useImperativeHandle(ref, () => ({
    undo: () => {
      crepeRef.current?.editor.action((ctx) => {
        ctx.get(commandsCtx).call(undoCommand.key);
      });
    },
    redo: () => {
      crepeRef.current?.editor.action((ctx) => {
        ctx.get(commandsCtx).call(redoCommand.key);
      });
    },
    insertImage: (relativeSrc, alt) => {
      crepeRef.current?.editor.action((ctx) => {
        ctx.get(commandsCtx).call(insertImageCommand.key, { src: relativeSrc, alt });
      });
    },
    scrollToHeading: (index) => {
      const headings = rootElRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  return <Milkdown />;
});

export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  return (
    <MilkdownProvider>
      <CrepeEditor {...props} ref={ref} />
    </MilkdownProvider>
  );
});
