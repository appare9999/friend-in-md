import React from "react";
import ReactDOM from "react-dom/client";
import { QuickNoteApp } from "./components/QuickNoteApp.js";
import "./quick-note.css";

// Registering a service worker (even a no-op one) is what makes Chromium
// offer to install this page as a standalone app.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/quick-note-sw.js", { scope: "/quick-note.html" }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickNoteApp />
  </React.StrictMode>
);
