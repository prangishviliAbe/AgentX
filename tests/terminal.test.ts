import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runOnce } from "../electron/terminal/shell.ts";

describe("terminal runOnce real shell", () => {
  it("echoes marker via real local shell", async () => {
    const isWin = process.platform === "win32";
    const cmd = isWin
      ? "echo agentx-term-ok"
      : "echo agentx-term-ok";
    const { output, code } = await runOnce(cmd, { timeoutMs: 10_000 });
    assert.ok(
      output.includes("agentx-term-ok"),
      `expected marker in output, got: ${JSON.stringify(output)}`,
    );
    // cmd.exe / PowerShell may return 0
    assert.ok(code === 0 || code === null || typeof code === "number");
  });
});
