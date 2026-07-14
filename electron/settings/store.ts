import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export type AppSettings = {
  alwaysApprove: boolean;
  /** When true, AgentX keeps sending continue prompts until the answer looks complete. */
  autoContinue: boolean;
  /** Max automatic follow-up turns (1–5). Only used when autoContinue is true. */
  autoContinueMax: number;
};

const DEFAULTS: AppSettings = {
  alwaysApprove: true,
  autoContinue: true,
  autoContinueMax: 3,
};

function settingsPath(): string {
  return path.join(os.homedir(), ".agentx", "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const p = settingsPath();
    if (!existsSync(p)) return { ...DEFAULTS };
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<AppSettings>;
    return {
      alwaysApprove:
        typeof raw.alwaysApprove === "boolean"
          ? raw.alwaysApprove
          : DEFAULTS.alwaysApprove,
      autoContinue:
        typeof raw.autoContinue === "boolean"
          ? raw.autoContinue
          : DEFAULTS.autoContinue,
      autoContinueMax: clampMax(raw.autoContinueMax),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const next: AppSettings = {
    ...loadSettings(),
    ...partial,
  };
  next.autoContinueMax = clampMax(next.autoContinueMax);
  const dir = path.join(os.homedir(), ".agentx");
  mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function clampMax(n: unknown): number {
  const v = typeof n === "number" ? n : DEFAULTS.autoContinueMax;
  return Math.min(5, Math.max(1, Math.round(v)));
}

export function getSettingsPath(): string {
  return settingsPath();
}
