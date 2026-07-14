import Editor from "@monaco-editor/react";
import type { OpenTab } from "../types";

type Props = {
  tabs: OpenTab[];
  activePath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChangeContent: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onOpenFolder: () => void;
};

export function EditorArea({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onSave,
  onOpenFolder,
}: Props) {
  const active = tabs.find((t) => t.path === activePath) || null;

  return (
    <section className="editor-area">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`tab ${tab.path === activePath ? "active" : ""}`}
            role="tab"
            aria-selected={tab.path === activePath}
            onClick={() => onSelectTab(tab.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelectTab(tab.path);
            }}
            tabIndex={0}
          >
            <span className="name">
              {tab.dirty ? "● " : ""}
              {tab.name}
            </span>
            <button
              type="button"
              className="close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="editor-host">
        {!active ? (
          <div className="editor-empty">
            <div>
              <h2>AgentX</h2>
              <p>
                Open a folder, edit files, and talk to Grok in the side panel —
                your Grok CLI account powers the agent.
              </p>
              <button type="button" className="btn btn-primary" onClick={onOpenFolder}>
                Open Folder
              </button>
            </div>
          </div>
        ) : (
          <Editor
            key={active.path}
            height="100%"
            theme="vs-dark"
            language={active.language}
            value={active.content}
            path={active.path}
            onChange={(value) => onChangeContent(active.path, value ?? "")}
            onMount={(editor, monaco) => {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                () => onSave(active.path),
              );
            }}
            options={{
              fontSize: 13,
              fontFamily:
                "Cascadia Code, Consolas, 'Courier New', monospace",
              minimap: { enabled: true, scale: 1 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              renderLineHighlight: "line",
              padding: { top: 8 },
              tabSize: 2,
            }}
          />
        )}
      </div>
    </section>
  );
}
