import { app, globalShortcut } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer, type FriendInMdServer } from "../dist-server/server/app.js";
import { createMainWindow, createQuickNoteWindow, setQuitting, showMainWindow, toggleQuickNoteWindow } from "./window.js";
import { createTray } from "./tray.js";
import { loadConfig } from "./config-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICON_DIR = path.resolve(__dirname, "assets/icons");
const TRAY_ICON = path.join(ICON_DIR, "tray-32.png");
const APP_ICON = path.join(ICON_DIR, "icon-256.png");

// "M" for memo. Avoids Ctrl+Shift+N, which collides with Chrome's incognito
// window and Windows Explorer's new-folder shortcut on many systems.
const QUICK_NOTE_SHORTCUT = "CommandOrControl+Shift+M";

// Set by `npm run electron:dev` to point windows at Vite's dev server (HMR)
// instead of the in-process server's own static-file serving.
const DEV_SERVER_URL = process.env.FRIEND_IN_MD_DEV_SERVER_URL || null;

let server: FriendInMdServer | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    const cfg = await loadConfig();

    const serverOpts = { port: 4317, dev: !!DEV_SERVER_URL, verbose: false };
    try {
      server = await createServer({ ...serverOpts, dir: cfg.lastRoot });
    } catch (err) {
      // Last-opened folder may have been moved/deleted since — fall back to
      // an empty root so the user can pick a new one from the RootPicker UI.
      console.error(err);
      server = await createServer({ ...serverOpts, dir: null });
    }

    // In dev, the API server (dev:true - CORS on, no static serving) still
    // runs in-process as usual; only the renderer's HTML/JS/CSS comes from
    // Vite instead, for HMR on QuickNoteApp/App while iterating.
    const rendererUrl = DEV_SERVER_URL ?? server.url;
    createMainWindow(rendererUrl, APP_ICON);
    createQuickNoteWindow(rendererUrl);
    createTray(TRAY_ICON, server.state);

    const shortcutOk = globalShortcut.register(QUICK_NOTE_SHORTCUT, () => toggleQuickNoteWindow());
    if (!shortcutOk) {
      console.warn(
        `⚠️ Could not register global shortcut ${QUICK_NOTE_SHORTCUT} — it may already be in use by another app.`
      );
    }
  });

  app.on("window-all-closed", () => {
    // Intentional no-op: the tray keeps the app (and server) alive after the
    // window is hidden. Quitting only happens via the tray's "Quit" item.
  });

  app.on("before-quit", () => {
    setQuitting(true);
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("will-quit", (event) => {
    if (server) {
      event.preventDefault();
      const toStop = server;
      server = null;
      toStop.stop().finally(() => app.exit(0));
    }
  });
}
