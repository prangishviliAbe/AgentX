/**
 * Handle ACP server→client requests (fs/* and terminal/*).
 * These are required when clientCapabilities advertise fs/terminal support.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type JsonRpcId = number | string;

type TerminalState = {
  proc: ChildProcess;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  byteLimit: number;
};

export class AcpClientHandlers {
  private terminals = new Map<string, TerminalState>();
  private nextTerm = 1;

  async handle(
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    switch (method) {
      case "fs/read_text_file":
        return this.readTextFile(params || {});
      case "fs/write_text_file":
        return this.writeTextFile(params || {});
      case "terminal/create":
        return this.terminalCreate(params || {});
      case "terminal/output":
        return this.terminalOutput(params || {});
      case "terminal/wait_for_exit":
        return this.terminalWait(params || {});
      case "terminal/kill":
        return this.terminalKill(params || {});
      case "terminal/release":
        return this.terminalRelease(params || {});
      default:
        // Unknown methods: empty success to avoid hard hangs
        return {};
    }
  }

  private async readTextFile(params: Record<string, unknown>) {
    const filePath = String(params.path || "");
    if (!filePath) throw new Error("fs/read_text_file: path required");
    const raw = await readFile(filePath, "utf8");
    let content = raw;
    const line = typeof params.line === "number" ? params.line : undefined;
    const limit = typeof params.limit === "number" ? params.limit : undefined;
    if (line != null || limit != null) {
      const lines = raw.split(/\r?\n/);
      const start = Math.max(0, (line ?? 1) - 1);
      const end = limit != null ? start + limit : lines.length;
      content = lines.slice(start, end).join("\n");
    }
    return { content };
  }

  private async writeTextFile(params: Record<string, unknown>) {
    const filePath = String(params.path || "");
    if (!filePath) throw new Error("fs/write_text_file: path required");
    const content = String(params.content ?? "");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return null;
  }

  /**
   * Grok often sends full shell one-liners as `command` with empty `args`
   * (e.g. entire PowerShell pipelines). Spawning that string as an executable
   * causes ENOENT and crashes Electron if the error event is unhandled.
   */
  private spawnCommand(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): ChildProcess {
    const looksLikeShellScript =
      args.length === 0 &&
      (/[|&;<>$`]/.test(command) ||
        /\s/.test(command) ||
        /^(Get-|Set-|if |foreach |\$)/i.test(command.trim()));

    if (process.platform === "win32" && (looksLikeShellScript || args.length === 0)) {
      // Prefer PowerShell for Get-*/pipelines; falls back cleanly for simple cmds.
      const isPs =
        looksLikeShellScript ||
        /^(Get-|Set-|Test-|Write-|Select-|ForEach|\$)/i.test(command.trim());
      if (isPs) {
        return spawn(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
          { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
        );
      }
      return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    }

    if (looksLikeShellScript) {
      return spawn(command, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: true,
      });
    }

    return spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
  }

  private terminalCreate(params: Record<string, unknown>) {
    const command = String(params.command || "");
    if (!command) throw new Error("terminal/create: command required");
    const args = Array.isArray(params.args)
      ? (params.args as unknown[]).map(String)
      : [];
    const cwd =
      typeof params.cwd === "string" && params.cwd
        ? params.cwd
        : process.cwd();
    const envList = Array.isArray(params.env) ? params.env : [];
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const item of envList) {
      if (item && typeof item === "object") {
        const o = item as { name?: string; value?: string };
        if (o.name) env[o.name] = o.value ?? "";
      }
    }
    const byteLimit =
      typeof params.outputByteLimit === "number"
        ? params.outputByteLimit
        : 1_048_576;

    const proc = this.spawnCommand(command, args, cwd, env);

    const terminalId = `term_${this.nextTerm++}`;
    const state: TerminalState = {
      proc,
      output: "",
      truncated: false,
      exitCode: null,
      signal: null,
      byteLimit,
    };

    const append = (chunk: Buffer) => {
      state.output += chunk.toString("utf8");
      if (state.output.length > byteLimit) {
        state.output = state.output.slice(state.output.length - byteLimit);
        state.truncated = true;
      }
    };
    proc.stdout?.on("data", append);
    proc.stderr?.on("data", append);
    // Critical: unhandled 'error' crashes the Electron main process (ENOENT dialog)
    proc.on("error", (err) => {
      append(Buffer.from(`\n[spawn error] ${err.message}\n`));
      state.exitCode = state.exitCode ?? 1;
      state.signal = state.signal ?? null;
    });
    proc.on("exit", (code, signal) => {
      state.exitCode = code;
      state.signal = signal;
    });

    this.terminals.set(terminalId, state);
    return { terminalId };
  }

  private terminalOutput(params: Record<string, unknown>) {
    const id = String(params.terminalId || "");
    const t = this.terminals.get(id);
    if (!t) throw new Error(`Unknown terminal: ${id}`);
    const result: Record<string, unknown> = {
      output: t.output,
      truncated: t.truncated,
    };
    if (t.exitCode !== null || t.signal !== null) {
      result.exitStatus = {
        exitCode: t.exitCode,
        signal: t.signal,
      };
    }
    return result;
  }

  private terminalWait(params: Record<string, unknown>): Promise<unknown> {
    const id = String(params.terminalId || "");
    const t = this.terminals.get(id);
    if (!t) return Promise.reject(new Error(`Unknown terminal: ${id}`));
    if (t.exitCode !== null || t.signal !== null) {
      return Promise.resolve({ exitCode: t.exitCode, signal: t.signal });
    }
    return new Promise((resolve) => {
      t.proc.once("exit", (code, signal) => {
        resolve({ exitCode: code, signal });
      });
    });
  }

  private terminalKill(params: Record<string, unknown>) {
    const id = String(params.terminalId || "");
    const t = this.terminals.get(id);
    if (!t) throw new Error(`Unknown terminal: ${id}`);
    try {
      if (process.platform === "win32" && t.proc.pid) {
        spawn("taskkill", ["/pid", String(t.proc.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        t.proc.kill();
      }
    } catch {
      // ignore
    }
    return {};
  }

  private terminalRelease(params: Record<string, unknown>) {
    const id = String(params.terminalId || "");
    const t = this.terminals.get(id);
    if (t) {
      try {
        t.proc.kill();
      } catch {
        // ignore
      }
      this.terminals.delete(id);
    }
    return {};
  }

  dispose(): void {
    for (const [, t] of this.terminals) {
      try {
        t.proc.kill();
      } catch {
        // ignore
      }
    }
    this.terminals.clear();
  }
}
