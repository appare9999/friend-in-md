import React from "react";
import ReactDOM from "react-dom/client";
import { QuickNoteApp } from "./components/QuickNoteApp.js";
import "./quick-note.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickNoteApp />
  </React.StrictMode>
);
