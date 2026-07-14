/**
 * Real local shell process manager (non-PTY child_process).
 * Stream stdout/stderr and accept stdin writes.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";

export type ShellOptions = {
  cwd?: string;
  shell?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
};

export type ShellExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function defaultShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    // Prefer PowerShell for interactive terminal; cmd via COMSPEC for runOnce
    return {
      shell: "powershell.exe",
      args: ["-NoLogo", "-NoProfile"],
    };
  }
  const sh = process.env.SHELL || "/bin/bash";
  return { shell: sh, args: ["-i"] };
}

export class LocalShell extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private _cwd: string;

  constructor(cwd?: string) {
    super();
    this._cwd = cwd || process.cwd();
  }

  get cwd(): string {
    return this._cwd;
  }

  get running(): boolean {
    return Boolean(this.proc && !this.proc.killed);
  }

  start(options: ShellOptions = {}): void {
    if (this.running) this.stop();

    this._cwd = options.cwd || this._cwd || process.cwd();
    const def = defaultShell();
    const shell = options.shell || def.shell;
    const args = options.args ?? def.args;

    this.proc = spawn(shell, args, {
      cwd: this._cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.proc.stdout.on("data", (buf: Buffer) => {
      this.emit("data", buf.toString("utf8"));
    });
    this.proc.stderr.on("data", (buf: Buffer) => {
      this.emit("data", buf.toString("utf8"));
    });
    this.proc.on("exit", (code, signal) => {
      this.proc = null;
      this.emit("exit", { code, signal } satisfies ShellExitInfo);
    });
    this.proc.on("error", (err) => {
      this.emit("error", err);
    });

    this.emit("ready", { cwd: this._cwd, shell, pid: this.proc.pid });
  }

  write(text: string): boolean {
    if (!this.proc?.stdin.writable) return false;
    this.proc.stdin.write(text);
    return true;
  }

  /** Run a one-shot command line (appends newline). */
  runLine(line: string): boolean {
    const payload = line.endsWith("\n") ? line : `${line}\n`;
    return this.write(payload);
  }

  stop(): void {
    if (!this.proc) return;
    try {
      if (process.platform === "win32" && this.proc.pid) {
        spawn("taskkill", ["/pid", String(this.proc.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        this.proc.kill();
      }
    } catch {
      // ignore
    }
    this.proc = null;
  }

  setCwd(cwd: string): void {
    this._cwd = cwd;
  }
}

/**
 * Run a short one-shot command and collect stdout+stderr.
 * Used by tests and optional "run and capture" paths.
 */
export function runOnce(
  command: string,
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number | null; output: string }> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const cwd = options.cwd || process.cwd();

  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? process.env.COMSPEC || "cmd.exe" : "/bin/sh";
    const args = isWin ? ["/d", "/s", "/c", command] : ["-c", command];

    const proc = spawn(shell, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let output = "";
    proc.stdout.on("data", (b: Buffer) => {
      output += b.toString("utf8");
    });
    proc.stderr.on("data", (b: Buffer) => {
      output += b.toString("utf8");
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`runOnce timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

export function platformShellLabel(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

export function homedir(): string {
  return os.homedir();
}
