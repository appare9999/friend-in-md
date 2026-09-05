import { cp, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const SRC = path.resolve("electron/assets/icons");
const DEST = path.resolve("dist-electron/assets/icons");

try {
  await access(SRC);
} catch {
  // Fresh checkout: electron/assets/icons is gitignored (generated from
  // electron/assets/icon.svg) and won't exist yet.
  execSync("npm run icons", { stdio: "inherit" });
}

await cp(SRC, DEST, { recursive: true });
console.log(`✅ Copied electron icons to ${path.relative(process.cwd(), DEST)}`);
