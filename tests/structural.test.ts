import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("UI/IPC structural wiring", () => {
  it("permission modal + IPC channels exist", () => {
    assert.ok(existsSync(path.join(root, "src/components/PermissionModal.tsx")));
    const main = read("electron/main.ts");
    const preload = read("electron/preload.ts");
    const app = read("src/App.tsx");
    assert.ok(main.includes("acp:permission"));
    assert.ok(main.includes("acp:permission-response"));
    assert.ok(preload.includes("acpPermissionResponse"));
    assert.ok(app.includes("PermissionModal"));
    assert.ok(app.includes("acp:permission"));
    assert.ok(app.includes("setAlwaysApprove"));
  });

  it("diff panel + changes IPC exist", () => {
    assert.ok(existsSync(path.join(root, "src/components/DiffPanel.tsx")));
    const main = read("electron/main.ts");
    const preload = read("electron/preload.ts");
    assert.ok(main.includes("changes:list"));
    assert.ok(main.includes("changes:decide"));
    assert.ok(preload.includes("changesDecide"));
    assert.ok(read("src/App.tsx").includes("DiffPanel") || read("src/components/Sidebar.tsx").includes("DiffPanel"));
  });

  it("terminal panel + term IPC exist", () => {
    assert.ok(existsSync(path.join(root, "src/components/TerminalPanel.tsx")));
    const main = read("electron/main.ts");
    const preload = read("electron/preload.ts");
    assert.ok(main.includes("term:start"));
    assert.ok(main.includes("term:write"));
    assert.ok(preload.includes("termStart"));
    assert.ok(read("src/components/Sidebar.tsx").includes("TerminalPanel"));
  });
});
