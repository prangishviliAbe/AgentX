/**
 * Ensures the Electron binary is present after npm install.
 * Some environments skip/fail postinstall scripts silently.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe =
  process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", "electron", "dist", "electron");

if (existsSync(exe)) {
  process.exit(0);
}

const installJs = path.join(root, "node_modules", "electron", "install.js");
if (!existsSync(installJs)) {
  console.warn("[ensure-electron] electron package missing; skip");
  process.exit(0);
}

console.log("[ensure-electron] Electron binary missing — running install.js …");
const result = spawnSync(process.execPath, [installJs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, force_no_cache: "true" },
});

if (result.status !== 0 || !existsSync(exe)) {
  console.warn(
    "[ensure-electron] Could not install Electron binary automatically.",
  );
  console.warn(
    "  Try: node node_modules/electron/install.js",
  );
}

process.exit(0);
