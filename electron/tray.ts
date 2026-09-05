import { Tray, Menu, app, dialog, shell, nativeImage } from "electron";
import type { ServerState } from "../dist-server/server/state.js";
import { showMainWindow, toggleQuickNoteWindow } from "./window.js";
import { loadConfig, recordOpenedRoot } from "./config-store.js";

export function createTray(iconPath: string, state: ServerState): Tray {
  const image = nativeImage.createFromPath(iconPath);
  const tray = new Tray(image);
  tray.setToolTip("Friend in MD");

  const rebuildMenu = async () => {
    const cfg = await loadConfig();
    const recentItems = cfg.recentRoots
      .filter((root) => root !== state.ctx?.root)
      .map((root) => ({
        label: root,
        click: async () => {
          await state.setRoot(root);
          await recordOpenedRoot(root);
          await rebuildMenu();
          showMainWindow();
        },
      }));
    const loginSettings = app.getLoginItemSettings();

    const menu = Menu.buildFromTemplate([
      { label: "Open full app", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "Open notes folder…",
        click: async () => {
          const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
          if (result.canceled || !result.filePaths[0]) return;
          const root = result.filePaths[0];
          await state.setRoot(root);
          await recordOpenedRoot(root);
          await rebuildMenu();
          showMainWindow();
        },
      },
      ...(recentItems.length ? [{ label: "Recent folders", submenu: recentItems }] : []),
      { type: "separator" },
      {
        label: "Start at login",
        type: "checkbox" as const,
        checked: loginSettings.openAtLogin,
        click: (item: Electron.MenuItem) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ]);
    tray.setContextMenu(menu);
  };

  void rebuildMenu();
  // macOS opens the context menu on left-click by default when one is set;
  // Windows/Linux fire this "click" event too, where it doubles as a toggle.
  tray.on("click", () => toggleQuickNoteWindow(tray.getBounds()));

  return tray;
}

// Standalone tray for the CLI/dev entry point (trayMain.ts): no in-process
// ServerState to build a folder-switching menu from, since the server it
// talks to runs in a separate `node` process.
export function createCliTray(iconPath: string, serverUrl: string): Tray {
  const image = nativeImage.createFromPath(iconPath);
  const tray = new Tray(image);
  tray.setToolTip("Friend in MD");

  const menu = Menu.buildFromTemplate([
    { label: "Open in browser", click: () => shell.openExternal(serverUrl) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => toggleQuickNoteWindow(tray.getBounds()));

  return tray;
}
