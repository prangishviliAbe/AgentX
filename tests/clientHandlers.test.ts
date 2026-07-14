import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AcpClientHandlers } from "../electron/acp/clientHandlers.ts";

const isWin = process.platform === "win32";

describe("ACP client fs handlers", () => {
  it("reads package.json content from workspace", async () => {
    const dir = path.join(os.tmpdir(), `agentx-fs-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pkgPath = path.join(dir, "package.json");
    writeFileSync(pkgPath, JSON.stringify({ name: "agentx", version: "1.0.0" }), "utf8");
    const h = new AcpClientHandlers();
    try {
      const res = (await h.handle("fs/read_text_file", {
        path: pkgPath,
      })) as { content: string };
      assert.ok(res.content.includes("agentx"));
      assert.ok(res.content.includes("1.0.0"));
      assert.ok(/"name"\s*:\s*"agentx"/.test(res.content));
    } finally {
      h.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes and re-reads a file", async () => {
    const dir = path.join(os.tmpdir(), `agentx-fs-w-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "note.txt");
    const h = new AcpClientHandlers();
    try {
      await h.handle("fs/write_text_file", {
        path: filePath,
        content: "hello-agentx",
      });
      const res = (await h.handle("fs/read_text_file", {
        path: filePath,
      })) as { content: string };
      assert.equal(res.content, "hello-agentx");
    } finally {
      h.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs PowerShell one-liner via terminal/create without crashing", async () => {
    if (!isWin) return;
    const h = new AcpClientHandlers();
    try {
      const created = (await h.handle("terminal/create", {
        command:
          "Get-ChildItem -Force | Select-Object -First 3 Name | Format-Table -AutoSize; Write-Output agentx-term-ps-ok",
        cwd: process.cwd(),
      })) as { terminalId: string };
      assert.ok(created.terminalId);
      const exit = (await h.handle("terminal/wait_for_exit", {
        terminalId: created.terminalId,
      })) as { exitCode: number | null };
      const out = (await h.handle("terminal/output", {
        terminalId: created.terminalId,
      })) as { output: string };
      assert.ok(
        out.output.includes("agentx-term-ps-ok") || exit.exitCode === 0,
        `output=${JSON.stringify(out.output.slice(0, 200))}`,
      );
      await h.handle("terminal/release", { terminalId: created.terminalId });
    } finally {
      h.dispose();
    }
  });
});
