import { readFile } from "node:fs/promises";
import { ChangeTracker, type PendingChange, buildFileDiff, type FileDiff } from "./diff";
import { writeTextFile } from "./workspace";

/**
 * High-level file change tracking for agent turns.
 */
export class WorkspaceChangeService {
  private tracker = new ChangeTracker();

  clear(): void {
    this.tracker.clear();
  }

  async captureBefore(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        const buf = await readFile(p);
        if (buf.byteLength > 2_000_000) continue;
        this.tracker.snapshot(p, buf.toString("utf8"));
      } catch {
        this.tracker.snapshot(p, "");
      }
    }
  }

  async captureAfter(path: string): Promise<PendingChange | null> {
    let after = "";
    try {
      const buf = await readFile(path);
      if (buf.byteLength > 2_000_000) return null;
      after = buf.toString("utf8");
    } catch {
      after = "";
    }
    if (!this.tracker.hasSnapshot(path)) {
      this.tracker.snapshot(path, "");
    }
    return this.tracker.recordAfter(path, after);
  }

  /** Snapshot unknown path as empty (new file) or disk content before agent writes. */
  async ensureSnapshot(path: string): Promise<void> {
    if (this.tracker.hasSnapshot(path)) return;
    try {
      const buf = await readFile(path);
      if (buf.byteLength <= 2_000_000) {
        this.tracker.snapshot(path, buf.toString("utf8"));
        return;
      }
    } catch {
      // new file
    }
    this.tracker.snapshot(path, "");
  }

  listPending(): PendingChange[] {
    return this.tracker.listPending();
  }

  getDiff(path: string): FileDiff | null {
    const c = this.tracker.get(path);
    if (!c) return null;
    return buildFileDiff(path, c.before, c.after);
  }

  listDiffs(): FileDiff[] {
    return this.listPending()
      .map((c) => buildFileDiff(c.path, c.before, c.after))
      .filter((d) => d.unified.length > 0 || d.before !== d.after);
  }

  /**
   * Apply: keep after on disk (already written by agent) — mark applied.
   * Reject: restore before content to disk.
   */
  async decide(
    path: string,
    decision: "apply" | "reject",
  ): Promise<{ path: string; content: string; status: string } | null> {
    const c = this.tracker.decide(path, decision);
    if (!c) return null;
    if (decision === "reject") {
      await writeTextFile(path, c.before);
      return { path, content: c.before, status: "rejected" };
    }
    // apply: agent already wrote after; ensure disk matches
    await writeTextFile(path, c.after);
    return { path, content: c.after, status: "applied" };
  }

  async decideAll(
    decision: "apply" | "reject",
  ): Promise<Array<{ path: string; content: string; status: string }>> {
    const pending = this.listPending();
    const results = [];
    for (const p of pending) {
      const r = await this.decide(p.path, decision);
      if (r) results.push(r);
    }
    return results;
  }
}
