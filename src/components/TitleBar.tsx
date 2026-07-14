type Props = {
  workspace: string | null;
  onOpenFolder: () => void;
  onSave: () => void;
  canSave: boolean;
};

export function TitleBar({ workspace, onOpenFolder, onSave, canSave }: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="mark">A</span>
        <span>AbeX</span>
      </div>
      <div className="titlebar-path" title={workspace || undefined}>
        {workspace || "No folder opened"}
      </div>
      <div className="titlebar-actions">
        <button type="button" className="btn" onClick={onOpenFolder}>
          Open Folder
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canSave}
          onClick={onSave}
          title="Ctrl/Cmd+S"
        >
          Save
        </button>
      </div>
    </header>
  );
}
