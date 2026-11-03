// Syncs the fullscreen slideshow (MarpPresentationView, same tab) with the
// presenter window (presenter.html, opened separately - typically dragged to
// a second monitor) over a same-origin BroadcastChannel. Either side can
// drive slide navigation.
export const PRESENTER_CHANNEL = "friend-in-md-marp-presenter";

export interface PresenterDeck {
  slides: string[];
  css: string;
  // comments[i] holds the HTML-comment speaker notes for slide i - Marp's
  // own convention (a plain `<!-- ... -->` inside a slide's markdown), so no
  // extra syntax is needed to write a script alongside the slides.
  notes: string[][];
}

export interface PresenterDeckMessage extends PresenterDeck {
  type: "deck";
  index: number;
}

export interface PresenterReadyMessage {
  type: "ready";
}

export interface PresenterNavMessage {
  type: "nav";
  index: number;
}

export type PresenterMessage = PresenterDeckMessage | PresenterReadyMessage | PresenterNavMessage;
