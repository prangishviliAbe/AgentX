import type { AuthStatus, FileDiff, FileNode, SidebarView } from "../types";
import { DiffPanel } from "./DiffPanel";
import { FileTree } from "./FileTree";
import { TerminalPanel } from "./TerminalPanel";

type Props = {
  view: SidebarView;
  tree: FileNode[];
  activePath: string | null;
  workspace: string | null;
  auth: AuthStatus | null;
  grokBinary: string;
  alwaysApprove: boolean;
  autoContinue: boolean;
  autoContinueMax: number;
  diffs: FileDiff[];
  selectedDiffPath: string | null;
  termOutput: string;
  termRunning: boolean;
  termCwd: string | null;
  onOpenFile: (node: FileNode) => void;
  onOpenFolder: () => void;
  onLogin: () => void;
  onRefreshAuth: () => void;
  onStartAgent: () => void;
  onToggleAlwaysApprove: (value: boolean) => void;
  onToggleAutoContinue: (value: boolean) => void;
  onChangeAutoContinueMax: (value: number) => void;
  onSelectDiff: (path: string) => void;
  onApplyDiff: (path: string) => void;
  onRejectDiff: (path: string) => void;
  onApplyAll: () => void;
  onRejectAll: () => void;
  onTermStart: () => void;
  onTermStop: () => void;
  onTermRunLine: (line: string) => void;
};

export function Sidebar({
  view,
  tree,
  activePath,
  workspace,
  auth,
  grokBinary,
  alwaysApprove,
  autoContinue,
  autoContinueMax,
  diffs,
  selectedDiffPath,
  termOutput,
  termRunning,
  termCwd,
  onOpenFile,
  onOpenFolder,
  onLogin,
  onRefreshAuth,
  onStartAgent,
  onToggleAlwaysApprove,
  onToggleAutoContinue,
  onChangeAutoContinueMax,
  onSelectDiff,
  onApplyDiff,
  onRejectDiff,
  onApplyAll,
  onRejectAll,
  onTermStart,
  onTermStop,
  onTermRunLine,
}: Props) {
  const titleMap: Record<SidebarView, string> = {
    explorer: "Explorer",
    search: "Search",
    changes: "Changes",
    terminal: "Terminal",
    settings: "Settings",
  };
  const title = titleMap[view];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>{title}</span>
        {view === "explorer" && (
          <button
            type="button"
            className="btn btn-ghost"
            title="Open Folder"
            onClick={onOpenFolder}
          >
            Open
          </button>
        )}
      </div>
      <div className="sidebar-body">
        {view === "explorer" && (
          <>
            {!workspace ? (
              <div className="empty-sidebar">
                <strong>No folder opened</strong>
                Open a project folder to edit files and chat with Grok in that
                workspace.
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onOpenFolder}
                  >
                    Open Folder
                  </button>
                </div>
              </div>
            ) : (
              <FileTree
                nodes={tree}
                activePath={activePath}
                onOpenFile={onOpenFile}
              />
            )}
          </>
        )}

        {view === "search" && (
          <div className="empty-sidebar">
            <strong>Search</strong>
            Project-wide search is planned for a later release. Use Grok chat to
            find code for now.
          </div>
        )}

        {view === "changes" && (
          <DiffPanel
            diffs={diffs}
            selectedPath={selectedDiffPath}
            onSelect={onSelectDiff}
            onApply={onApplyDiff}
            onReject={onRejectDiff}
            onApplyAll={onApplyAll}
            onRejectAll={onRejectAll}
          />
        )}

        {view === "terminal" && (
          <TerminalPanel
            output={termOutput}
            running={termRunning}
            cwd={termCwd || workspace}
            onStart={onTermStart}
            onStop={onTermStop}
            onRunLine={onTermRunLine}
          />
        )}

        {view === "settings" && (
          <div className="settings-block">
            <div className="settings-row">
              <label>Grok account</label>
              <div>
                {auth?.loggedIn ? (
                  <span className="badge ok">Signed in</span>
                ) : (
                  <span className="badge bad">Not signed in</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button type="button" className="btn" onClick={onLogin}>
                  Login with Grok
                </button>
                <button type="button" className="btn" onClick={onRefreshAuth}>
                  Refresh
                </button>
              </div>
            </div>

            <div className="settings-row">
              <label>Tool permissions</label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alwaysApprove}
                  onChange={(e) => onToggleAlwaysApprove(e.target.checked)}
                />
                <span>Auto-approve tool calls</span>
              </label>
              <p className="hint">
                Off = interactive Allow/Deny modal when Grok wants to run a tool.
              </p>
            </div>

            <div className="settings-row">
              <label>Agent auto-continue</label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={autoContinue}
                  onChange={(e) => onToggleAutoContinue(e.target.checked)}
                />
                <span>Auto-continue (no need for Continue)</span>
              </label>
              <p className="hint">
                On: if Grok only posts a plan and stops, AbeX auto-continues
                until a full answer. Off: manual Continue only.
              </p>
              {autoContinue && (
                <label className="toggle-row" style={{ marginTop: 8 }}>
                  <span style={{ minWidth: 90 }}>Max steps</span>
                  <select
                    value={autoContinueMax}
                    onChange={(e) =>
                      onChangeAutoContinueMax(Number(e.target.value))
                    }
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                      borderRadius: 4,
                      padding: "4px 8px",
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="settings-row">
              <label>Auth file</label>
              <code>{auth?.authPath || "—"}</code>
            </div>

            <div className="settings-row">
              <label>Grok binary</label>
              <code>{grokBinary || "—"}</code>
            </div>

            <div className="settings-row">
              <label>Workspace</label>
              <code>{workspace || "None"}</code>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={onStartAgent}
            >
              Start / reconnect agent
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
