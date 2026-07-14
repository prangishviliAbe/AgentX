import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPromptBlocks } from "../electron/acp/promptBlocks.ts";

describe("buildPromptBlocks for screenshots", () => {
  it("text only", () => {
    const blocks = buildPromptBlocks("hello");
    assert.deepEqual(blocks, [{ type: "text", text: "hello" }]);
  });

  it("image only gets analysis hint + image block", () => {
    const blocks = buildPromptBlocks("", [
      { mimeType: "image/png", data: "AAA", uri: "attachment://shot.png" },
    ]);
    assert.equal(blocks[0].type, "text");
    assert.match((blocks[0] as { text: string }).text, /Analyze/i);
    assert.equal(blocks[1].type, "image");
    assert.equal((blocks[1] as { mimeType: string }).mimeType, "image/png");
    assert.equal((blocks[1] as { data: string }).data, "AAA");
  });

  it("text + images order is text then images", () => {
    const blocks = buildPromptBlocks("what is this?", [
      { mimeType: "image/jpeg", data: "BBB" },
    ]);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[1].type, "image");
  });

  it("empty throws", () => {
    assert.throws(() => buildPromptBlocks("   "), /Empty prompt/);
  });
});
