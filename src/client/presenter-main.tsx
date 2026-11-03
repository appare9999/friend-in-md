import React from "react";
import ReactDOM from "react-dom/client";
import { PresenterView } from "./components/PresenterView.js";
import "./presenter.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PresenterView />
  </React.StrictMode>
);
