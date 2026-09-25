import { useEffect, useRef, useState } from "react";
import { Marp } from "@marp-team/marp-core";
import { fetchMarpThemeCss, type CustomMarpTheme } from "../http/client.js";
import { getRawMarpTheme } from "../lib/marp.js";
import { PRESENTER_CHANNEL, type PresenterDeck, type PresenterMessage } from "../lib/presenterChannel.js";

interface Props {
  content: string;
  customThemes: CustomMarpTheme[];
  onClose: () => void;
}

function buildSlideDoc(html: string, css: string): string {
  // The svg itself (no explicit preserveAspectRatio attribute) already
  // defaults to "xMidYMid meet" - letterbox and center its viewBox content
  // to fit whatever box it's given. Relying on that instead of CSS's
  // replaced-element max-width/max-height sizing algorithm (which needs an
  // intrinsic size stamped onto the svg and still fits inconsistently
  // across browsers) is what actually fills the screen edge-to-edge.
  // div.marpit needs an explicit height too: a block element's width
  // defaults to filling its parent, but height doesn't (CSS's normal-flow
  // asymmetry) - without it, height:100% on the svg has no definite
  // percentage base and silently falls back to the width-derived aspect
  // ratio, overflowing/shrinking instead of actually filling the box.
  return `<!doctype html><html><head><style>${css}</style><style>
    html, body, div.marpit { margin: 0; height: 100%; background: #000; }
    svg[data-marpit-svg] { display: block; width: 100%; height: 100%; }
  </style></head><body><div class="marpit">${html}</div></body></html>`;
}

export function MarpPresentationView({ content, customThemes, onClose }: Props) {
  const [deck, setDeck] = useState<PresenterDeck | null>(null);
  const [index, setIndex] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const deckRef = useRef<PresenterDeck | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

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
      const { html, css, comments } = marp.render(content, { htmlAsArray: true });
      if (cancelled) return;
      setDeck({ slides: html, css, notes: comments });
      setIndex((i) => Math.min(i, html.length - 1));
    })();
    return () => {
      cancelled = true;
    };
  }, [content, customThemes]);

  // Set up once: a presenter window announces itself with "ready" (covers
  // one opened after the deck already loaded), and either side can send
  // "nav" to drive the other's slide index.
  useEffect(() => {
    const channel = new BroadcastChannel(PRESENTER_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent<PresenterMessage>) => {
      const msg = e.data;
      if (msg.type === "ready" && deckRef.current) {
        channel.postMessage({
          type: "deck",
          ...deckRef.current,
          index: indexRef.current,
        } satisfies PresenterMessage);
      } else if (msg.type === "nav") {
        setIndex(msg.index);
      }
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (!deck) return;
    channelRef.current?.postMessage({ type: "deck", ...deck, index } satisfies PresenterMessage);
  }, [deck, index]);

  const total = deck?.slides.length ?? 0;

  // Referenced by the keydown handler below, which is only set up once (its
  // deps are just [onClose]) - a ref keeps it seeing the current slide count.
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(total - 1, next)));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        setIndex((i) => Math.min(totalRef.current - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "PageUp") {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  // Opening this as a separate window - rather than automatically when the
  // slideshow starts - is what leaves the click that starts the slideshow
  // free to spend its user-gesture "activation" on requestFullscreen()
  // instead (see handlePresent in App.tsx): a browser only honors one
  // activation-gated API call per click.
  const openPresenterWindow = () => {
    window.open("/presenter.html", "friend-in-md-presenter", "width=1000,height=650");
  };

  return (
    <div className="marp-presentation-view">
      {deck && total > 0 ? (
        <iframe
          key={index}
          className="marp-presentation-frame"
          title={`Slide ${index + 1}`}
          sandbox="allow-same-origin"
          srcDoc={buildSlideDoc(deck.slides[index], deck.css)}
        />
      ) : (
        <div className="marp-presentation-loading">Loading…</div>
      )}

      <div className="marp-presentation-controls">
        <button onClick={() => goTo(index - 1)} disabled={index === 0} title="Previous slide (←)">
          ◀
        </button>
        <span className="marp-presentation-counter">
          {total > 0 ? `${index + 1} / ${total}` : ""}
        </span>
        <button onClick={() => goTo(index + 1)} disabled={index + 1 >= total} title="Next slide (→ / space)">
          ▶
        </button>
        <button onClick={toggleFullscreen} title="Toggle true OS fullscreen (hides the browser's own tabs/address bar)">
          {isFullscreen ? "⛶ Exit fullscreen" : "⛶ Fullscreen"}
        </button>
        <button onClick={openPresenterWindow} title="Open the presenter notes/script window (drag it to a second display)">
          📝 Presenter notes
        </button>
        <button onClick={onClose} title="Exit presentation (Esc)">
          ✕ Exit
        </button>
      </div>
    </div>
  );
}
