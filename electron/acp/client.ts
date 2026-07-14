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
import { AcpClientHandlers } from "./clientHandlers";
import { buildPromptBlocks } from "./promptBlocks";

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

/** Pull human-visible text out of heterogeneous ACP update shapes. */
export function extractUpdateText(update: Record<string, unknown>): string {
  const content = update.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const c = content as { text?: unknown; content?: unknown };
    if (typeof c.text === "string") return c.text;
    if (typeof c.content === "string") return c.content;
  }
  if (typeof update.text === "string") return update.text;
  return "";
}

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
  private planFirst: boolean;
  private started = false;
  private handlers = new AcpClientHandlers();

  constructor(options: {
    cwd: string;
    alwaysApprove?: boolean;
    planFirst?: boolean;
  }) {
    super();
    this.cwd = options.cwd;
    this.alwaysApprove = options.alwaysApprove ?? true;
    this.planFirst = options.planFirst ?? true;
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

  setPlanFirst(value: boolean): void {
    this.planFirst = value;
  }

  private sessionRules(): string {
    const base = [
      "Be concise and practical.",
      "When streaming is available, include brief reasoning steps (thinking) before tool use and final answers.",
    ];
    if (this.planFirst) {
      base.push(
        "PLAN-FIRST MODE (required): For non-trivial create/build/implement/redesign requests (apps, games, features, multi-file work):",
        "1) First reply with a short plan only: goal, main files, 3–6 steps, risks.",
        "2) Explicitly ask the user to confirm before writing/editing files or running destructive commands.",
        "3) Do NOT create, edit, or delete project files until the user confirms (yes / ok / continue / გააგრძელე / დაიწყე / კი).",
        "4) Simple Q&A, explanations, reviews, and read-only inspection may proceed without waiting.",
      );
    }
    return base.join("\n");
  }

  async start(): Promise<void> {
    if (this.started) return;

    const bin = resolveGrokBinary();
    // When auto-approve is on, also pass CLI flag — Grok's internal tools honor it.
    // Interactive mode omits the flag and uses session/request_permission → UI.
    const args = this.alwaysApprove
      ? ["agent", "--always-approve", "stdio"]
      : ["agent", "stdio"];

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
        version: "1.1.0",
      },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });

    const session = (await this.request("session/new", {
      cwd: this.cwd,
      mcpServers: [],
      _meta: { rules: this.sessionRules() },
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
      _meta: { rules: this.sessionRules() },
    })) as { sessionId?: string };

    if (!session?.sessionId) {
      throw new Error("Failed to recreate ACP session for new workspace");
    }

    this.sessionId = session.sessionId;
    this.emit("ready", { sessionId: this.sessionId, cwd: this.cwd });
  }

  /**
   * Send a user prompt. Blocks may include text and base64 images
   * (ACP ContentBlock: { type: "text" } | { type: "image", mimeType, data }).
   */
  async prompt(
    text: string,
    images?: Array<{ mimeType: string; data: string; uri?: string }>,
    options?: { timeoutMs?: number },
  ): Promise<{ assistantText: string; thoughtText: string; timedOut?: boolean }> {
    if (!this.sessionId) throw new Error("ACP session not ready");
    const prompt = buildPromptBlocks(text, images);
    const timeoutMs = options?.timeoutMs ?? 180_000;

    let assistantText = "";
    let thoughtText = "";
    let timedOut = false;
    const onUpdate = (update: AcpUpdate | Record<string, unknown>) => {
      const u = update as AcpUpdate & Record<string, unknown>;
      const kind = String(u.sessionUpdate || "");
      const chunk = extractUpdateText(u);
      if (!chunk) return;
      if (kind === "agent_message_chunk") assistantText += chunk;
      if (kind === "agent_thought_chunk") thoughtText += chunk;
    };
    this.on("update", onUpdate);

    const work = this.request("session/prompt", {
      sessionId: this.sessionId,
      prompt,
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            this.cancel();
            reject(new Error(`Agent turn timed out after ${Math.round(timeoutMs / 1000)}s`));
          }, timeoutMs);
        }),
      ]);
      // Grok sometimes flushes a few more chunks right after the RPC result
      await new Promise((r) => setTimeout(r, 150));
    } finally {
      if (timer) clearTimeout(timer);
      this.off("update", onUpdate);
    }

    this.emit("turn-complete", {
      assistantText: assistantText.trim(),
      thoughtText: thoughtText.trim(),
      timedOut,
    });
    return {
      assistantText: assistantText.trim(),
      thoughtText: thoughtText.trim(),
      timedOut,
    };
  }

  /** Cancel in-flight turn so the UI can unlock. */
  cancel(): void {
    if (!this.sessionId || !this.proc) return;
    try {
      this.write({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: this.sessionId },
      });
    } catch {
      // ignore
    }
    // Unblock any hanging prompt promise
    for (const [id, p] of this.pending) {
      p.reject(new Error("Cancelled"));
      this.pending.delete(id);
    }
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
    this.handlers.dispose();
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

    // Response to our request
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

    // Server → client request
    if (typeof msg.id !== "undefined" && typeof msg.method === "string") {
      void this.handleServerRequest(
        msg.id as number | string,
        msg.method,
        (msg.params || {}) as Record<string, unknown>,
      );
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

  private async handleServerRequest(
    id: number | string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (
        method === "session/request_permission" ||
        method === "requestPermission" ||
        method.endsWith("/request_permission")
      ) {
        const normalized = normalizePermissionRequest(id, params);
        if (this.alwaysApprove) {
          this.write(
            buildAlwaysApproveResponse(
              normalized.requestId,
              normalized.options,
            ),
          );
        } else {
          this.emit("permission", normalized);
        }
        return;
      }

      const result = await this.handlers.handle(method, params);
      this.write({ jsonrpc: "2.0", id, result });
    } catch (err) {
      this.write({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : String(err),
        },
      });
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
