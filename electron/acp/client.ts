import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildAlwaysApproveResponse,
  buildPermissionResponse,
  normalizePermissionRequest,
  type PermissionDecision,
  type PermissionRequestPayload,
} from "./permission";

export type AcpUpdate =
  | {
      sessionUpdate: "agent_message_chunk";
      content?: { type?: string; text?: string };
    }
  | {
      sessionUpdate: "agent_thought_chunk";
      content?: { type?: string; text?: string };
    }
  | {
      sessionUpdate: "tool_call";
      toolCallId?: string;
      title?: string;
      kind?: string;
      status?: string;
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId?: string;
      status?: string;
      title?: string;
    }
  | {
      sessionUpdate: "plan";
      entries?: unknown[];
    }
  | {
      sessionUpdate: string;
      [key: string]: unknown;
    };

export type AcpPermissionRequest = PermissionRequestPayload;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

function resolveGrokBinary(): string {
  if (process.env.GROK_BIN && existsSync(process.env.GROK_BIN)) {
    return process.env.GROK_BIN;
  }

  const home = os.homedir();
  const candidates =
    process.platform === "win32"
      ? [
          path.join(home, ".grok", "bin", "grok.exe"),
          path.join(home, ".local", "bin", "grok.exe"),
          "grok.exe",
          "grok",
        ]
      : [path.join(home, ".grok", "bin", "grok"), path.join(home, ".local", "bin", "grok"), "grok"];

  for (const candidate of candidates) {
    if (candidate === "grok" || candidate === "grok.exe") continue;
    if (existsSync(candidate)) return candidate;
  }

  return process.platform === "win32" ? "grok.exe" : "grok";
}

export class GrokAcpClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private cwd: string;
  private alwaysApprove: boolean;
  private started = false;

  constructor(options: { cwd: string; alwaysApprove?: boolean }) {
    super();
    this.cwd = options.cwd;
    this.alwaysApprove = options.alwaysApprove ?? true;
  }

  get activeSessionId(): string | null {
    return this.sessionId;
  }

  get isRunning(): boolean {
    return this.started && this.proc != null && !this.proc.killed;
  }

  get alwaysApproveEnabled(): boolean {
    return this.alwaysApprove;
  }

  setAlwaysApprove(value: boolean): void {
    this.alwaysApprove = value;
  }

  async start(): Promise<void> {
    if (this.started) return;

    const bin = resolveGrokBinary();
    // Never pass --always-approve: we handle allow/deny in-process so the UI
    // can toggle interactive permissions without restarting the agent.
    const args = ["agent", "stdio"];

    this.proc = spawn(bin, args, {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this.onLine(line));

    this.proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.emit("stderr", text);
    });

    this.proc.on("exit", (code, signal) => {
      this.started = false;
      this.sessionId = null;
      for (const [, p] of this.pending) {
        p.reject(new Error(`Grok agent exited (code=${code}, signal=${signal})`));
      }
      this.pending.clear();
      this.emit("exit", { code, signal });
    });

    this.proc.on("error", (err) => {
      this.emit("error", err);
    });

    this.started = true;

    await this.request("initialize", {
      protocolVersion: 1,
      clientInfo: {
        name: "AgentX",
        version: "1.0.0",
      },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });

    const session = (await this.request("session/new", {
      cwd: this.cwd,
      mcpServers: [],
    })) as { sessionId?: string };

    if (!session?.sessionId) {
      throw new Error("Failed to create ACP session (missing sessionId)");
    }

    this.sessionId = session.sessionId;
    this.emit("ready", { sessionId: this.sessionId, cwd: this.cwd });
  }

  async setCwd(cwd: string): Promise<void> {
    this.cwd = cwd;
    if (!this.isRunning) return;

    const session = (await this.request("session/new", {
      cwd: this.cwd,
      mcpServers: [],
    })) as { sessionId?: string };

    if (!session?.sessionId) {
      throw new Error("Failed to recreate ACP session for new workspace");
    }

    this.sessionId = session.sessionId;
    this.emit("ready", { sessionId: this.sessionId, cwd: this.cwd });
  }

  async prompt(text: string): Promise<void> {
    if (!this.sessionId) throw new Error("ACP session not ready");

    await this.request("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
    });
  }

  async respondPermission(
    requestId: number | string,
    optionId: string,
  ): Promise<void> {
    this.write({
      jsonrpc: "2.0",
      id: requestId,
      result: { outcome: { outcome: "selected", optionId } },
    });
  }

  /**
   * High-level allow/deny used by UI; maps to ACP option ids.
   */
  respondPermissionDecision(
    request: PermissionRequestPayload,
    decision: PermissionDecision,
  ): void {
    const response = buildPermissionResponse(
      request.requestId,
      decision,
      request.options,
    );
    this.write(response);
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = null;
    this.started = false;
    this.sessionId = null;
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.emit("parse-error", trimmed);
      return;
    }

    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const pending = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        const err = msg.error as { message?: string; code?: number };
        pending.reject(new Error(err.message || `ACP error ${err.code ?? ""}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Permission request (server -> client request)
    if (typeof msg.id !== "undefined" && typeof msg.method === "string") {
      const method = msg.method;
      if (
        method === "session/request_permission" ||
        method === "requestPermission" ||
        method.endsWith("/request_permission")
      ) {
        const normalized = normalizePermissionRequest(
          msg.id as number | string,
          (msg.params || {}) as Record<string, unknown>,
        );
        if (this.alwaysApprove) {
          this.write(
            buildAlwaysApproveResponse(normalized.requestId, normalized.options),
          );
        } else {
          this.emit("permission", normalized);
        }
        return;
      }

      // Unknown server request — acknowledge empty result to avoid hangs
      this.write({ jsonrpc: "2.0", id: msg.id, result: {} });
      return;
    }

    if (typeof msg.method === "string") {
      if (msg.method === "session/update") {
        const params = msg.params as { update?: AcpUpdate; sessionId?: string };
        if (params?.update) {
          this.emit("update", params.update, params.sessionId);
        }
        return;
      }
      this.emit("notification", msg);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) return Promise.reject(new Error("Agent process not started"));

    const id = this.nextId++;
    // Long agent turns should not time out; only bootstrap calls get a bound.
    const timeoutMs =
      method === "session/prompt" ? 0 : method.startsWith("session/") ? 120_000 : 60_000;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });

      if (timeoutMs > 0) {
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error(`ACP request timed out: ${method}`));
          }
        }, timeoutMs);
      }
    });
  }

  private write(payload: unknown): void {
    if (!this.proc?.stdin.writable) return;
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

export function checkAuthStatus(): {
  loggedIn: boolean;
  authPath: string;
  hasApiKey: boolean;
} {
  const authPath = path.join(os.homedir(), ".grok", "auth.json");
  const loggedIn = existsSync(authPath);
  const hasApiKey = Boolean(process.env.XAI_API_KEY);
  return { loggedIn: loggedIn || hasApiKey, authPath, hasApiKey };
}

export function getGrokBinaryPath(): string {
  return resolveGrokBinary();
}
