import { BrowserWindow, shell, screen, type Rectangle } from "electron";

let mainWindow: BrowserWindow | null = null;
let quickNoteWindow: BrowserWindow | null = null;
let isQuitting = false;

const QUICK_NOTE_WIDTH = 380;
const QUICK_NOTE_HEIGHT = 520;

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function createMainWindow(url: string, iconPath: string): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // README links / anything opened with target=_blank should go to the
  // system browser, not spawn a second app window pointed at an external site.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  return mainWindow;
}

export function toggleMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

export function showMainWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createQuickNoteWindow(url: string): BrowserWindow {
  quickNoteWindow = new BrowserWindow({
    width: QUICK_NOTE_WIDTH,
    height: QUICK_NOTE_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  quickNoteWindow.loadURL(`${url}/quick-note.html`);

  // A popup that's hidden 99% of the time never needs to participate in app
  // shutdown - always hide, never destroy, until the whole process exits.
  quickNoteWindow.on("blur", () => quickNoteWindow?.hide());
  quickNoteWindow.on("close", (event) => {
    event.preventDefault();
    quickNoteWindow?.hide();
  });

  return quickNoteWindow;
}

function clampToWorkArea(x: number, y: number): { x: number; y: number } {
  const { workArea } = screen.getDisplayNearestPoint({ x, y });
  return {
    x: Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - QUICK_NOTE_WIDTH),
    y: Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - QUICK_NOTE_HEIGHT),
  };
}

function positionQuickNoteWindow(trayBounds?: Rectangle): void {
  if (!quickNoteWindow) return;

  if (trayBounds && trayBounds.width > 0) {
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - QUICK_NOTE_WIDTH / 2);
    // macOS trays sit at the top of the screen; Windows/Linux trays typically at the bottom.
    const y =
      process.platform === "darwin"
        ? trayBounds.y + trayBounds.height + 4
        : trayBounds.y - QUICK_NOTE_HEIGHT - 4;
    const clamped = clampToWorkArea(x, y);
    quickNoteWindow.setPosition(clamped.x, clamped.y);
    return;
  }

  // No tray bounds available (e.g. triggered by the global shortcut) - fall
  // back to the bottom-right corner of the display nearest the cursor.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  quickNoteWindow.setPosition(
    workArea.x + workArea.width - QUICK_NOTE_WIDTH - 16,
    workArea.y + workArea.height - QUICK_NOTE_HEIGHT - 16
  );
}

export function toggleQuickNoteWindow(trayBounds?: Rectangle): void {
  if (!quickNoteWindow) return;
  if (quickNoteWindow.isVisible()) {
    quickNoteWindow.hide();
    return;
  }
  positionQuickNoteWindow(trayBounds);
  quickNoteWindow.show();
  quickNoteWindow.focus();
}
