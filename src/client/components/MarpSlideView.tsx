import { useEffect, useState } from "react";
import { Marp } from "@marp-team/marp-core";
import { fetchMarpThemeCss, type CustomMarpTheme } from "../http/client.js";
import { getRawMarpTheme } from "../lib/marp.js";

interface Props {
  content: string;
  customThemes: CustomMarpTheme[];
}

function buildSrcDoc(html: string, css: string): string {
  return `<!doctype html><html><head><style>${css}</style><style>
    body { margin: 0; background: #666; }
    svg[data-marpit-svg] { display: block; margin: 16px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
  </style></head><body>${html}</body></html>`;
}

export function MarpSlideView({ content, customThemes }: Props) {
  const [srcDoc, setSrcDoc] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const marp = new Marp({ html: false });
      const themeName = getRawMarpTheme(content);
      const custom = themeName ? customThemes.find((t) => t.name === themeName) : undefined;
      if (custom) {
        try {
          const css = await fetchMarpThemeCss(custom.fileName);
          if (cancelled) return;
          marp.themeSet.add(css);
        } catch {
          // Custom theme CSS failed to load - fall through and render with
          // whatever theme Marp resolves without it.
        }
      }
      if (cancelled) return;
      const { html, css } = marp.render(content);
      if (cancelled) return;
      setSrcDoc(buildSrcDoc(html, css));
    })();

    return () => {
      cancelled = true;
    };
  }, [content, customThemes]);

  return (
    <iframe className="marp-slide-view-frame" title="Marp slide preview" sandbox="allow-same-origin" srcDoc={srcDoc} />
  );
}
