import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAlwaysApproveResponse,
  buildPermissionResponse,
  normalizePermissionRequest,
  resolveOptionId,
} from "../electron/acp/permission.ts";

describe("permission ACP response shapes", () => {
  it("allow maps to allow-like option id when provided", () => {
    const options = [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ];
    assert.equal(resolveOptionId("allow", options), "allow-once");
    assert.equal(resolveOptionId("deny", options), "reject-once");
  });

  it("buildPermissionResponse allow produces selected outcome", () => {
    const res = buildPermissionResponse(42, "allow", [
      { optionId: "allow-once" },
      { optionId: "reject-once" },
    ]);
    assert.equal(res.jsonrpc, "2.0");
    assert.equal(res.id, 42);
    assert.equal(res.result.outcome.outcome, "selected");
    assert.equal(res.result.outcome.optionId, "allow-once");
  });

  it("buildPermissionResponse deny produces reject option", () => {
    const res = buildPermissionResponse("req-1", "deny", [
      { optionId: "allow-once" },
      { optionId: "reject-once" },
    ]);
    assert.equal(res.id, "req-1");
    assert.equal(res.result.outcome.optionId, "reject-once");
  });

  it("always-approve uses allow path", () => {
    const res = buildAlwaysApproveResponse(7);
    assert.equal(res.result.outcome.optionId, "allow-once");
  });

  it("normalizePermissionRequest uses message id as requestId", () => {
    const n = normalizePermissionRequest(99, {
      sessionId: "s1",
      toolCall: { title: "Write file", kind: "edit", toolCallId: "t1" },
      options: [{ optionId: "allow-once" }],
    });
    assert.equal(n.requestId, 99);
    assert.equal(n.sessionId, "s1");
    assert.equal(n.toolCall?.title, "Write file");
    assert.equal(n.options?.[0].optionId, "allow-once");
  });

  it("allow vs deny produce different option ids", () => {
    const opts = [
      { optionId: "allow-once" },
      { optionId: "reject-once" },
    ];
    const a = buildPermissionResponse(1, "allow", opts);
    const d = buildPermissionResponse(1, "deny", opts);
    assert.notEqual(a.result.outcome.optionId, d.result.outcome.optionId);
  });
});
