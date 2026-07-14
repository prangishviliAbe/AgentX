import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyChangeDecision,
  buildFileDiff,
  ChangeTracker,
  diffLines,
  hasMeaningfulDiff,
  toUnifiedDiff,
} from "../electron/fs/diff.ts";

describe("diff compute and apply", () => {
  it("detects insert/delete/replace lines", () => {
    const before = "a\nb\nc";
    const after = "a\nB\nc\nd";
    const lines = diffLines(before, after);
    const adds = lines.filter((l) => l.type === "add");
    const dels = lines.filter((l) => l.type === "del");
    assert.ok(adds.some((l) => l.text === "B" || l.text === "d"));
    assert.ok(dels.some((l) => l.text === "b"));
    assert.ok(hasMeaningfulDiff(before, after));
  });

  it("unified diff is non-empty for changes", () => {
    const u = toUnifiedDiff("src/a.ts", "hello\n", "hello\nworld\n");
    assert.ok(u.includes("--- a/src/a.ts"));
    assert.ok(u.includes("+++ b/src/a.ts"));
    assert.ok(u.includes("+world") || u.includes("+hello"));
    assert.ok(u.length > 0);
  });

  it("buildFileDiff marks new and deleted", () => {
    const neu = buildFileDiff("new.txt", "", "x");
    assert.equal(neu.isNew, true);
    const del = buildFileDiff("gone.txt", "x", "");
    assert.equal(del.isDeleted, true);
  });

  it("apply keeps after; reject keeps before", () => {
    assert.equal(applyChangeDecision("old", "new", "apply"), "new");
    assert.equal(applyChangeDecision("old", "new", "reject"), "old");
  });

  it("ChangeTracker pending apply/reject lifecycle", () => {
    const t = new ChangeTracker();
    t.snapshot("f.txt", "v1");
    const c = t.recordAfter("f.txt", "v2");
    assert.ok(c);
    assert.equal(c!.status, "pending");
    assert.equal(t.listPending().length, 1);

    const applied = t.decide("f.txt", "apply");
    assert.equal(applied!.status, "applied");
    assert.equal(t.listPending().length, 0);
    assert.equal(t.getSnapshot("f.txt"), "v2");

    t.clear();
    t.snapshot("g.txt", "a");
    t.recordAfter("g.txt", "b");
    const rejected = t.decide("g.txt", "reject");
    assert.equal(rejected!.status, "rejected");
    assert.equal(t.getSnapshot("g.txt"), "a");
    assert.equal(applyChangeDecision(rejected!.before, rejected!.after, "reject"), "a");
  });

  it("no pending when content unchanged", () => {
    const t = new ChangeTracker();
    t.snapshot("same.txt", "x");
    assert.equal(t.recordAfter("same.txt", "x"), null);
  });
});
