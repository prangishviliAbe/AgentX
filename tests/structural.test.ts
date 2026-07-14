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

  it("image attach / paste / ACP image blocks exist", () => {
    const chat = read("src/components/ChatPanel.tsx");
    assert.ok(chat.includes("onPaste"));
    assert.ok(chat.includes("Attach"));
    assert.ok(read("electron/acp/promptBlocks.ts").includes('type: "image"'));
    assert.ok(read("electron/main.ts").includes("dialog:open-images"));
    assert.ok(read("electron/acp/clientHandlers.ts").includes("fs/read_text_file"));
  });

  it("chat activity rail + markdown assistant render exist", () => {
    const chat = read("src/components/ChatPanel.tsx");
    const css = read("src/styles/global.css");
    assert.ok(chat.includes("activity-rail"));
    assert.ok(chat.includes("status-pill"));
    assert.ok(chat.includes("renderMarkdown"));
    assert.ok(chat.includes("liveThought"));
    assert.ok(existsSync(path.join(root, "src/lib/markdown.ts")));
    assert.ok(css.includes(".activity-rail"));
    assert.ok(css.includes(".md-h"));
    assert.ok(css.includes(".thinking-skeleton"));
    assert.ok(read("src/App.tsx").includes("setLiveThought"));
    assert.ok(read("src/App.tsx").includes("activityHint"));
  });

  it("boot splash with product name and codename exists", () => {
    assert.ok(existsSync(path.join(root, "src/components/SplashScreen.tsx")));
    const splash = read("src/components/SplashScreen.tsx");
    const css = read("src/styles/global.css");
    assert.ok(splash.includes("AgentX"));
    assert.ok(splash.includes("AbeX"));
    assert.ok(read("src/App.tsx").includes("SplashScreen"));
    assert.ok(css.includes(".splash-screen"));
    assert.ok(css.includes(".splash-title"));
    assert.ok(css.includes("prefers-reduced-motion"));
  });
});

