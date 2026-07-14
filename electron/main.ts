import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogReturnValue,
} from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  GrokAcpClient,
  checkAuthStatus,
  getGrokBinaryPath,
  type AcpPermissionRequest,
} from "./acp/client";
import type { PermissionDecision } from "./acp/permission";
import {
  listTree,
  readTextFile,
  writeTextFile,
  pathExists,
} from "./fs/workspace";
import { WorkspaceChangeService } from "./fs/snapshots";
import { buildFileDiff } from "./fs/diff";
import { LocalShell } from "./terminal/shell";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
const isDev = !app.isPackaged;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

let mainWindow: BrowserWindow | null = null;
let acp: GrokAcpClient | null = null;
let workspacePath: string | null = null;
let alwaysApprove = true;
const changes = new WorkspaceChangeService();
let shellSession: LocalShell | null = null;
const watchedPaths = new Set<string>();

function resolvePreload(): string {
  const candidates = [
    path.join(__dirname, "preload.cjs"),
    path.join(__dirname, "preload.js"),
    path.join(__dirname, "preload.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function resolveDevServerUrl(): string | null {
  const fromEnv = process.env.VITE_DEV_SERVER_URL?.trim();
  if (fromEnv) return fromEnv;
  if (isDev) return "http://127.0.0.1:5173/";
  return null;
}

function createWindow(): void {
  const preload = resolvePreload();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1e1e1e",
    title: "AgentX",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[agentx] did-fail-load", { code, desc, url });
  });

  mainWindow.webContents.on("preload-error", (_e, pathName, error) => {
    console.error("[agentx] preload-error", pathName, error);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = resolveDevServerUrl();
  if (devUrl) {
    const url = devUrl.replace("://localhost", "://127.0.0.1");
    void mainWindow.loadURL(url);
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function extractPathHint(update: Record<string, unknown>): string | null {
  const title = String(update.title || update.toolCallId || "");
  const raw =
    (update as { rawInput?: unknown }).rawInput ||
    (update as { content?: unknown }).content;
  const candidates: string[] = [];

  if (typeof raw === "object" && raw) {
    const o = raw as Record<string, unknown>;
    for (const key of ["path", "file", "filePath", "target", "filename"]) {
      if (typeof o[key] === "string") candidates.push(o[key] as string);
    }
  }
  // Paths in title: Write src/foo.ts
  const m = title.match(
    /(?:[A-Za-z]:)?[\\/]?[\w.@%+=-]+(?:[\\/][\w.@%+=-]+)+\.\w{1,12}/,
  );
  if (m) candidates.push(m[0]);

  for (const c of candidates) {
    if (!c) continue;
    if (path.isAbsolute(c)) return c;
    if (workspacePath) return path.join(workspacePath, c);
  }
  return null;
}

function bindAcp(client: GrokAcpClient): void {
  client.on("update", (update: Record<string, unknown>) => {
    send("acp:update", update);
    const kind = String(update.sessionUpdate || "");
    if (kind === "tool_call") {
      const p = extractPathHint(update);
      if (p) {
        watchedPaths.add(p);
        void changes.ensureSnapshot(p);
      }
    }
    if (kind === "tool_call_update") {
      const status = String(update.status || "").toLowerCase();
      if (
        status.includes("complet") ||
        status === "done" ||
        status === "success" ||
        status === "failed"
      ) {
        const p = extractPathHint(update);
        const paths = p ? [p] : [...watchedPaths];
        void (async () => {
          for (const filePath of paths) {
            await changes.ensureSnapshot(filePath);
            const change = await changes.captureAfter(filePath);
            if (change) {
              send("changes:updated", {
                change,
                diff: buildFileDiff(change.path, change.before, change.after),
                pending: changes.listPending(),
                diffs: changes.listDiffs(),
              });
            }
          }
        })();
      }
    }
  });

  client.on("permission", (req: AcpPermissionRequest) => {
    send("acp:permission", req);
  });

  client.on("stderr", (text: string) => {
    send("acp:log", { level: "stderr", text });
  });

  client.on("exit", (info) => {
    send("acp:exit", info);
  });

  client.on("error", (err: Error) => {
    send("acp:error", { message: err.message });
  });

  client.on("ready", (info) => {
    send("acp:ready", info);
  });
}

async function ensureAcp(cwd: string): Promise<GrokAcpClient> {
  if (acp?.isRunning) {
    if (workspacePath !== cwd) {
      workspacePath = cwd;
      await acp.setCwd(cwd);
    }
    acp.setAlwaysApprove(alwaysApprove);
    return acp;
  }

  acp?.stop();
  workspacePath = cwd;
  acp = new GrokAcpClient({ cwd, alwaysApprove });
  bindAcp(acp);
  await acp.start();
  return acp;
}

function ensureShell(cwd?: string): LocalShell {
  const target = cwd || workspacePath || process.cwd();
  if (!shellSession) {
    shellSession = new LocalShell(target);
    shellSession.on("data", (text: string) => send("term:data", { text }));
    shellSession.on("exit", (info) => send("term:exit", info));
    shellSession.on("error", (err: Error) =>
      send("term:error", { message: err.message }),
    );
    shellSession.on("ready", (info) => send("term:ready", info));
  } else {
    shellSession.setCwd(target);
  }
  return shellSession;
}

function registerIpc(): void {
  ipcMain.handle("app:get-info", async () => ({
    version: app.getVersion(),
    platform: process.platform,
    grokBinary: getGrokBinaryPath(),
    auth: checkAuthStatus(),
    alwaysApprove,
  }));

  ipcMain.handle("auth:status", async () => checkAuthStatus());

  /** Pick image files from disk (for chat attachments). */
  ipcMain.handle("dialog:open-images", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      title: "Attach images / screenshots",
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        },
      ],
    });
    if (result.canceled || !result.filePaths.length) return [];
    const out: Array<{
      name: string;
      path: string;
      mimeType: string;
      data: string;
      previewUrl: string;
    }> = [];
    for (const filePath of result.filePaths) {
      try {
        const { readFile } = await import("node:fs/promises");
        const buf = await readFile(filePath);
        if (buf.byteLength > 8_000_000) {
          throw new Error(`Image too large (>8MB): ${path.basename(filePath)}`);
        }
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        const mime =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : ext === "webp"
                ? "image/webp"
                : ext === "bmp"
                  ? "image/bmp"
                  : ext === "svg"
                    ? "image/svg+xml"
                    : "image/png";
        const data = buf.toString("base64");
        out.push({
          name: path.basename(filePath),
          path: filePath,
          mimeType: mime,
          data,
          previewUrl: `data:${mime};base64,${data}`,
        });
      } catch (err) {
        send("acp:error", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return out;
  });

  ipcMain.handle("auth:login", async () => {
    const bin = getGrokBinaryPath();
    return new Promise<{ ok: boolean; message: string }>((resolve) => {
      const child = spawn(bin, ["login"], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        env: { ...process.env },
      });
      child.unref();
      child.on("error", (err) => {
        resolve({ ok: false, message: err.message });
      });
      setTimeout(() => {
        resolve({
          ok: true,
          message:
            "Browser login started. Complete sign-in, then refresh status.",
        });
      }, 500);
    });
  });

  ipcMain.handle("settings:get", async () => ({ alwaysApprove }));
  ipcMain.handle("settings:set-always-approve", async (_e, value: boolean) => {
    alwaysApprove = Boolean(value);
    acp?.setAlwaysApprove(alwaysApprove);
    return { alwaysApprove };
  });

  ipcMain.handle("workspace:open", async () => {
    const result: OpenDialogReturnValue = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Open Folder",
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const folder = result.filePaths[0];
    workspacePath = folder;
    changes.clear();
    watchedPaths.clear();
    try {
      await ensureAcp(folder);
    } catch (err) {
      send("acp:error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (shellSession?.running) {
      shellSession.stop();
      shellSession = null;
    }
    return folder;
  });

  ipcMain.handle("workspace:get", async () => workspacePath);

  ipcMain.handle("workspace:set", async (_e, folder: string) => {
    if (!(await pathExists(folder))) {
      throw new Error(`Folder does not exist: ${folder}`);
    }
    workspacePath = folder;
    changes.clear();
    watchedPaths.clear();
    try {
      await ensureAcp(folder);
    } catch (err) {
      send("acp:error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return folder;
  });

  ipcMain.handle("fs:list-tree", async (_e, root?: string) => {
    const base = root || workspacePath;
    if (!base) return [];
    return listTree(base);
  });

  ipcMain.handle("fs:read-file", async (_e, filePath: string) => {
    return readTextFile(filePath);
  });

  ipcMain.handle(
    "fs:write-file",
    async (_e, filePath: string, content: string) => {
      await writeTextFile(filePath, content);
      return true;
    },
  );

  ipcMain.handle("acp:start", async (_e, cwd?: string) => {
    const folder = cwd || workspacePath || process.cwd();
    workspacePath = folder;
    const client = await ensureAcp(folder);
    return {
      sessionId: client.activeSessionId,
      cwd: folder,
      auth: checkAuthStatus(),
      alwaysApprove,
    };
  });

  ipcMain.handle("acp:stop", async () => {
    acp?.stop();
    acp = null;
    return true;
  });

  ipcMain.handle(
    "acp:prompt",
    async (
      _e,
      text: string,
      snapshotPaths?: string[],
      images?: Array<{ mimeType: string; data: string; uri?: string }>,
    ) => {
      if (!acp?.isRunning) {
        if (!workspacePath) {
          throw new Error("Open a folder before chatting with Grok.");
        }
        await ensureAcp(workspacePath);
      }
      if (snapshotPaths?.length) {
        for (const p of snapshotPaths) watchedPaths.add(p);
        await changes.captureBefore(snapshotPaths);
      }
      await acp!.prompt(text, images);
      // After turn, re-check watched paths
      for (const p of watchedPaths) {
        const change = await changes.captureAfter(p);
        if (change) {
          send("changes:updated", {
            change,
            diff: buildFileDiff(change.path, change.before, change.after),
            pending: changes.listPending(),
            diffs: changes.listDiffs(),
          });
        }
      }
      return true;
    },
  );

  ipcMain.handle(
    "acp:permission-response",
    async (
      _e,
      requestId: number | string,
      decisionOrOptionId: string,
      options?: AcpPermissionRequest["options"],
    ) => {
      if (!acp) return false;
      if (decisionOrOptionId === "allow" || decisionOrOptionId === "deny") {
        acp.respondPermissionDecision(
          {
            requestId,
            options,
          },
          decisionOrOptionId as PermissionDecision,
        );
      } else {
        await acp.respondPermission(requestId, decisionOrOptionId);
      }
      return true;
    },
  );

  ipcMain.handle("acp:status", async () => ({
    running: Boolean(acp?.isRunning),
    sessionId: acp?.activeSessionId ?? null,
    cwd: workspacePath,
    auth: checkAuthStatus(),
    alwaysApprove,
  }));

  // —— Changes / diff ——
  ipcMain.handle("changes:list", async () => ({
    pending: changes.listPending(),
    diffs: changes.listDiffs(),
  }));

  ipcMain.handle("changes:watch", async (_e, filePath: string) => {
    watchedPaths.add(filePath);
    await changes.ensureSnapshot(filePath);
    return true;
  });

  ipcMain.handle(
    "changes:decide",
    async (_e, filePath: string, decision: "apply" | "reject") => {
      const result = await changes.decide(filePath, decision);
      send("changes:updated", {
        pending: changes.listPending(),
        diffs: changes.listDiffs(),
        last: result,
      });
      return result;
    },
  );

  ipcMain.handle(
    "changes:decide-all",
    async (_e, decision: "apply" | "reject") => {
      const results = await changes.decideAll(decision);
      send("changes:updated", {
        pending: changes.listPending(),
        diffs: changes.listDiffs(),
        lastBatch: results,
      });
      return results;
    },
  );

  // —— Terminal ——
  ipcMain.handle("term:start", async (_e, cwd?: string) => {
    const s = ensureShell(cwd);
    if (!s.running) s.start({ cwd: cwd || workspacePath || undefined });
    return { running: s.running, cwd: s.cwd };
  });

  ipcMain.handle("term:stop", async () => {
    shellSession?.stop();
    return true;
  });

  ipcMain.handle("term:write", async (_e, text: string) => {
    if (!shellSession?.running) {
      const s = ensureShell();
      s.start();
    }
    return shellSession!.write(text);
  });

  ipcMain.handle("term:run-line", async (_e, line: string) => {
    if (!shellSession?.running) {
      const s = ensureShell();
      s.start();
    }
    return shellSession!.runLine(line);
  });

  ipcMain.handle("term:status", async () => ({
    running: Boolean(shellSession?.running),
    cwd: shellSession?.cwd ?? workspacePath,
  }));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  acp?.stop();
  shellSession?.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  acp?.stop();
  shellSession?.stop();
});
