import { app, globalShortcut } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createQuickNoteWindow, toggleQuickNoteWindow } from "./window.js";
import { createCliTray } from "./tray.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAY_ICON = path.join(__dirname, "assets/icons/tray-32.png");

// "M" for memo. Avoids Ctrl+Shift+N, which collides with Chrome's incognito
// window and Windows Explorer's new-folder shortcut on many systems.
const QUICK_NOTE_SHORTCUT = "CommandOrControl+Shift+M";

// Set by the `node` parent (src/server/index.ts) once its server (or, in
// --dev, the Vite dev server) is up. This entry point never starts its own
// server — it's the lightweight tray for `npx friend-in-md` / `npm run dev`,
// as opposed to main.ts's full desktop app.
const SERVER_URL = process.env.FRIEND_IN_MD_SERVER_URL;

if (!SERVER_URL) {
  console.error("FRIEND_IN_MD_SERVER_URL must be set to launch the tray");
  app.exit(1);
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.whenReady().then(() => {
      createQuickNoteWindow(SERVER_URL);
      createCliTray(TRAY_ICON, SERVER_URL);

      const shortcutOk = globalShortcut.register(QUICK_NOTE_SHORTCUT, () => toggleQuickNoteWindow());
      if (!shortcutOk) {
        console.warn(
          `⚠️ Could not register global shortcut ${QUICK_NOTE_SHORTCUT} — it may already be in use by another app.`
        );
      }
    });

    app.on("window-all-closed", () => {
      // The tray keeps this process alive; quitting only happens via the
      // tray's "Quit" item (which also lets the `node` parent process exit).
    });

    app.on("will-quit", () => globalShortcut.unregisterAll());
  }
}
