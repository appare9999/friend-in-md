import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isWsl, windowsPathToWsl } from "./platform.js";

const execFileAsync = promisify(execFile);

async function tryCommand(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    const result = stdout.trim();
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// The FolderBrowserDialog has no window of its own to attach to when launched
// this way, so it can open behind other windows. Give it a hidden, topmost
// owner form so it's forced to the front.
const POWERSHELL_FOLDER_PICKER =
  "Add-Type -AssemblyName System.Windows.Forms; " +
  "$owner = New-Object System.Windows.Forms.Form; " +
  "$owner.TopMost = $true; " +
  "$owner.ShowInTaskbar = $false; " +
  "$owner.WindowState = 'Minimized'; " +
  "$owner.Show(); " +
  "$owner.Activate(); " +
  "$f = New-Object System.Windows.Forms.FolderBrowserDialog; " +
  "$result = $f.ShowDialog($owner); " +
  "$owner.Dispose(); " +
  "if ($result -eq 'OK') { Write-Output $f.SelectedPath }";

async function pickFolderWindows(): Promise<string | null> {
  return tryCommand("powershell.exe", ["-NoProfile", "-Command", POWERSHELL_FOLDER_PICKER]);
}

async function pickFolderWsl(): Promise<string | null> {
  const windowsPath = await pickFolderWindows();
  if (!windowsPath) return null;
  return windowsPathToWsl(windowsPath);
}

async function pickFolderLinux(): Promise<string | null> {
  const zenity = await tryCommand("zenity", [
    "--file-selection",
    "--directory",
    "--title=Select a markdown folder",
  ]);
  if (zenity) return zenity;
  return tryCommand("kdialog", ["--getexistingdirectory", process.env.HOME ?? "/"]);
}

export async function pickFolderNative(): Promise<string | null> {
  if (process.platform === "darwin") {
    return tryCommand("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Select a markdown folder")',
    ]);
  }
  if (process.platform === "win32") {
    return pickFolderWindows();
  }
  if (isWsl()) {
    return pickFolderWsl();
  }
  return pickFolderLinux();
}
