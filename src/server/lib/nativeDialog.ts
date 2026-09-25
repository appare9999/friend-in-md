import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isWsl, windowsPathToWsl } from "./platform.js";

const execFileAsync = promisify(execFile);

// Distinguishes "no dialog tool exists on this system" (unavailable) from
// "the tool ran but the user closed/cancelled it" (cancelled) - callers need
// to treat those very differently: unavailable should permanently hide the
// native-picker UI, cancelled should just let the user try again.
export type PickFolderResult =
  | { status: "picked"; path: string }
  | { status: "cancelled" }
  | { status: "unavailable" };

interface CommandOutcome {
  missing: boolean;
  output: string | null;
}

async function tryCommand(cmd: string, args: string[]): Promise<CommandOutcome> {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    const result = stdout.trim();
    return { missing: false, output: result.length > 0 ? result : null };
  } catch (err) {
    // ENOENT means the command itself isn't installed - any other failure
    // (non-zero exit, etc.) means the tool ran but the user cancelled it.
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    return { missing, output: null };
  }
}

function outcomeToResult(outcome: CommandOutcome): PickFolderResult {
  if (outcome.missing) return { status: "unavailable" };
  return outcome.output ? { status: "picked", path: outcome.output } : { status: "cancelled" };
}

// The FolderBrowserDialog has no window of its own to attach to when launched
// this way, so it can open behind other windows. Give it a hidden, topmost
// owner form so it's forced to the front.
// Windows PowerShell writes its redirected stdout using the console's active
// codepage (often a legacy DBCS one like Shift_JIS on Japanese systems), but
// Node always decodes child stdout as UTF-8. Without forcing the output
// encoding here, any non-ASCII folder name (e.g. Japanese) comes back
// mangled and downstream filesystem calls fail.
const POWERSHELL_FOLDER_PICKER =
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
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

async function pickFolderWindows(): Promise<PickFolderResult> {
  const outcome = await tryCommand("powershell.exe", ["-NoProfile", "-Command", POWERSHELL_FOLDER_PICKER]);
  return outcomeToResult(outcome);
}

async function pickFolderWsl(): Promise<PickFolderResult> {
  const result = await pickFolderWindows();
  if (result.status !== "picked") return result;
  const wslPath = await windowsPathToWsl(result.path);
  return wslPath ? { status: "picked", path: wslPath } : { status: "cancelled" };
}

async function pickFolderLinux(): Promise<PickFolderResult> {
  const zenity = await tryCommand("zenity", [
    "--file-selection",
    "--directory",
    "--title=Select a markdown folder",
  ]);
  if (!zenity.missing) return outcomeToResult(zenity);

  const kdialog = await tryCommand("kdialog", ["--getexistingdirectory", process.env.HOME ?? "/"]);
  return outcomeToResult(kdialog);
}

export async function pickFolderNative(): Promise<PickFolderResult> {
  if (process.platform === "darwin") {
    const outcome = await tryCommand("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Select a markdown folder")',
    ]);
    return outcomeToResult(outcome);
  }
  if (process.platform === "win32") {
    return pickFolderWindows();
  }
  if (isWsl()) {
    return pickFolderWsl();
  }
  return pickFolderLinux();
}
