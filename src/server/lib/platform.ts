import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    return readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

const WINDOWS_PATH_RE = /^[A-Za-z]:[\\/]/;

export function looksLikeWindowsPath(input: string): boolean {
  return WINDOWS_PATH_RE.test(input);
}

export async function windowsPathToWsl(windowsPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("wslpath", ["-u", windowsPath]);
    const result = stdout.trim();
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}
