import type { FileDiff } from "../types";
import { fileName } from "../lib/language";

type Props = {
  diffs: FileDiff[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onApply: (path: string) => void;
  onReject: (path: string) => void;
  onApplyAll: () => void;
  onRejectAll: () => void;
};

export function DiffPanel({
  diffs,
  selectedPath,
  onSelect,
  onApply,
  onReject,
  onApplyAll,
  onRejectAll,
}: Props) {
  const active = diffs.find((d) => d.path === selectedPath) || diffs[0] || null;

  if (diffs.length === 0) {
    return (
      <div className="empty-sidebar">
        <strong>No pending changes</strong>
        When Grok edits files, diffs appear here so you can apply or reject.
      </div>
    );
  }

  return (
    <div className="diff-panel">
      <div className="diff-toolbar">
        <button type="button" className="btn btn-primary" onClick={onApplyAll}>
          Apply all
        </button>
        <button type="button" className="btn" onClick={onRejectAll}>
          Reject all
        </button>
      </div>
      <div className="diff-layout">
        <div className="diff-file-list">
          {diffs.map((d) => (
            <button
              key={d.path}
              type="button"
              className={`diff-file ${active?.path === d.path ? "active" : ""}`}
              onClick={() => onSelect(d.path)}
              title={d.path}
            >
              <span className="label">{fileName(d.path)}</span>
              <span className="badge-mini">
                {d.isNew ? "new" : d.isDeleted ? "del" : "edit"}
              </span>
            </button>
          ))}
        </div>
        {active && (
          <div className="diff-view">
            <div className="diff-view-header">
              <span className="mono path" title={active.path}>
                {active.path}
              </span>
              <div className="diff-view-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onApply(active.path)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onReject(active.path)}
                >
                  Reject
                </button>
              </div>
            </div>
            <pre className="diff-unified">
              {active.unified ||
                active.lines
                  .map((l) =>
                    l.type === "add"
                      ? `+${l.text}`
                      : l.type === "del"
                        ? `-${l.text}`
                        : ` ${l.text}`,
                  )
                  .join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
