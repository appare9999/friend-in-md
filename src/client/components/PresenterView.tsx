import { useEffect, useRef, useState } from "react";
import { PRESENTER_CHANNEL, type PresenterDeck, type PresenterMessage } from "../lib/presenterChannel.js";

function buildThumbDoc(html: string, css: string): string {
  return `<!doctype html><html><head><style>${css}</style><style>
    html, body, div.marpit { margin: 0; height: 100%; background: #000; }
    svg[data-marpit-svg] { display: block; width: 100%; height: 100%; }
  </style></head><body><div class="marpit">${html}</div></body></html>`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function PresenterView() {
  const [deck, setDeck] = useState<PresenterDeck | null>(null);
  const [index, setIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const channel = new BroadcastChannel(PRESENTER_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent<PresenterMessage>) => {
      const msg = e.data;
      if (msg.type === "deck") {
        setDeck({ slides: msg.slides, css: msg.css, notes: msg.notes });
        setIndex(msg.index);
      }
    };
    channel.postMessage({ type: "ready" } satisfies PresenterMessage);
    return () => channel.close();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = deck?.slides.length ?? 0;
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  const navigate = (next: number) => {
    const clamped = Math.max(0, Math.min(totalRef.current - 1, next));
    setIndex(clamped);
    channelRef.current?.postMessage({ type: "nav", index: clamped } satisfies PresenterMessage);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") navigate(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "PageUp") navigate(index - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!deck) {
    return <div className="presenter-empty">Waiting for the presentation to start…</div>;
  }

  const notes = deck.notes[index] ?? [];

  return (
    <div className="presenter-view">
      <div className="presenter-main">
        <iframe
          key={index}
          className="presenter-current"
          title="Current slide"
          sandbox="allow-same-origin"
          srcDoc={buildThumbDoc(deck.slides[index], deck.css)}
        />
        <div className="presenter-notes">
          {notes.length > 0 ? (
            notes.map((note, i) => <p key={i}>{note}</p>)
          ) : (
            <p className="presenter-notes-empty">
              No notes for this slide. Add some in the slide's markdown with an HTML comment:{" "}
              <code>{"<!-- your script here -->"}</code>
            </p>
          )}
        </div>
      </div>
      <div className="presenter-sidebar">
        <div className="presenter-timer">{formatElapsed(elapsedMs)}</div>
        <div className="presenter-counter">
          {index + 1} / {total}
        </div>
        {index + 1 < total && (
          <>
            <div className="presenter-next-label">Next</div>
            <iframe
              key={`next-${index}`}
              className="presenter-next"
              title="Next slide"
              sandbox="allow-same-origin"
              srcDoc={buildThumbDoc(deck.slides[index + 1], deck.css)}
            />
          </>
        )}
        <div className="presenter-controls">
          <button onClick={() => navigate(index - 1)} disabled={index === 0}>
            ◀ Prev
          </button>
          <button onClick={() => navigate(index + 1)} disabled={index + 1 >= total}>
            Next ▶
          </button>
        </div>
      </div>
    </div>
  );
}
