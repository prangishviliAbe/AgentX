/**
 * Pure unified-diff + apply helpers for AgentX review panel.
 */

export type DiffLine = {
  type: "context" | "add" | "del";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
  unified: string;
  lines: DiffLine[];
  isNew: boolean;
  isDeleted: boolean;
};

export type PendingChange = {
  path: string;
  before: string;
  after: string;
  status: "pending" | "applied" | "rejected";
};

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Simple LCS-based line diff (fine for typical agent file edits).
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "context", text: a[i], oldLine, newLine });
      i++;
      j++;
      oldLine++;
      newLine++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i], oldLine });
      i++;
      oldLine++;
    } else {
      out.push({ type: "add", text: b[j], newLine });
      j++;
      newLine++;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: a[i], oldLine });
    i++;
    oldLine++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j], newLine });
    j++;
    newLine++;
  }
  return out;
}

export function toUnifiedDiff(
  path: string,
  before: string,
  after: string,
): string {
  const lines = diffLines(before, after);
  if (lines.length === 0 && before === after) return "";

  const header = [
    `--- a/${path.replace(/\\/g, "/")}`,
    `+++ b/${path.replace(/\\/g, "/")}`,
  ];
  const body: string[] = [];
  let hunk: string[] = [];
  let oldStart = 0;
  let newStart = 0;
  let oldCount = 0;
  let newCount = 0;
  let started = false;

  const flush = () => {
    if (!hunk.length) return;
    body.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    body.push(...hunk);
    hunk = [];
    oldCount = 0;
    newCount = 0;
    started = false;
  };

  for (const line of lines) {
    if (line.type === "context") {
      if (!started) {
        oldStart = line.oldLine ?? 1;
        newStart = line.newLine ?? 1;
        started = true;
      }
      hunk.push(` ${line.text}`);
      oldCount++;
      newCount++;
    } else if (line.type === "del") {
      if (!started) {
        oldStart = line.oldLine ?? 1;
        newStart = Math.max(1, (line.oldLine ?? 1));
        started = true;
      }
      hunk.push(`-${line.text}`);
      oldCount++;
    } else {
      if (!started) {
        oldStart = Math.max(1, (line.newLine ?? 1));
        newStart = line.newLine ?? 1;
        started = true;
      }
      hunk.push(`+${line.text}`);
      newCount++;
    }
  }
  flush();
  if (!body.length && before !== after) {
    // empty vs non-empty edge
    return [...header, "@@ -0,0 +1,1 @@", ...splitLines(after).map((l) => `+${l}`)].join(
      "\n",
    );
  }
  return [...header, ...body].join("\n");
}

export function buildFileDiff(
  path: string,
  before: string,
  after: string,
): FileDiff {
  const lines = diffLines(before, after);
  return {
    path,
    before,
    after,
    unified: toUnifiedDiff(path, before, after),
    lines,
    isNew: before === "" && after !== "",
    isDeleted: before !== "" && after === "",
  };
}

/**
 * Apply decision: "apply" returns after content; "reject" returns before.
 * Does not touch disk — caller writes.
 */
export function applyChangeDecision(
  before: string,
  after: string,
  decision: "apply" | "reject",
): string {
  return decision === "apply" ? after : before;
}

export function hasMeaningfulDiff(before: string, after: string): boolean {
  return before !== after;
}

/** Snapshot store for tracking file state across an agent turn. */
export class ChangeTracker {
  private snapshots = new Map<string, string>();
  private pending = new Map<string, PendingChange>();

  snapshot(path: string, content: string): void {
    if (!this.snapshots.has(path)) {
      this.snapshots.set(path, content);
    }
  }

  /** Force-replace baseline (e.g. after reject restore). */
  forceSnapshot(path: string, content: string): void {
    this.snapshots.set(path, content);
  }

  hasSnapshot(path: string): boolean {
    return this.snapshots.has(path);
  }

  getSnapshot(path: string): string | undefined {
    return this.snapshots.get(path);
  }

  recordAfter(path: string, after: string): PendingChange | null {
    const before = this.snapshots.has(path)
      ? (this.snapshots.get(path) as string)
      : "";
    if (before === after) return null;
    const change: PendingChange = {
      path,
      before,
      after,
      status: "pending",
    };
    this.pending.set(path, change);
    // Keep baseline as original before until applied/rejected settles
    return change;
  }

  listPending(): PendingChange[] {
    return [...this.pending.values()].filter((c) => c.status === "pending");
  }

  listAll(): PendingChange[] {
    return [...this.pending.values()];
  }

  decide(path: string, decision: "apply" | "reject"): PendingChange | null {
    const c = this.pending.get(path);
    if (!c || c.status !== "pending") return null;
    c.status = decision === "apply" ? "applied" : "rejected";
    if (decision === "apply") {
      this.snapshots.set(path, c.after);
    } else {
      this.snapshots.set(path, c.before);
    }
    return c;
  }

  clear(): void {
    this.snapshots.clear();
    this.pending.clear();
  }

  get(path: string): PendingChange | undefined {
    return this.pending.get(path);
  }
}
