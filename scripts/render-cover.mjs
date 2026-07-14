/**
 * Renders assets/cover.html → assets/cover.png (1280×640)
 * Uses the project's Electron binary as a headless screenshot tool.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import electronPath from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "assets", "cover.html");
const outPath = path.join(root, "assets", "cover.png");
const runnerPath = path.join(root, "scripts", "_cover-runner.cjs");

if (!existsSync(htmlPath)) {
  console.error("Missing assets/cover.html");
  process.exit(1);
}

// Electron main that loads the HTML file and captures PNG
const runner = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const htmlPath = process.env.COVER_HTML;
const outPath = process.env.COVER_OUT;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 640,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  win.setContentSize(1280, 640);
  await win.loadFile(htmlPath);
  // Wait for fonts / layout
  await new Promise((r) => setTimeout(r, 1200));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 640 });
  fs.writeFileSync(outPath, image.toPNG());
  console.log('WROTE', outPath, image.getSize());
  app.quit();
});
`;

writeFileSync(runnerPath, runner, "utf8");

const child = spawn(String(electronPath), [runnerPath], {
  cwd: root,
  env: {
    ...process.env,
    COVER_HTML: htmlPath,
    COVER_OUT: outPath,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  try {
    // cleanup runner
    // keep for debug if failed
    if (code === 0 && existsSync(outPath)) {
      console.log("Cover ready:", outPath);
      process.exit(0);
    }
    process.exit(code || 1);
  } catch {
    process.exit(1);
  }
});
