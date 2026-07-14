import { useEffect, useRef, useState } from "react";

type Props = {
  output: string;
  running: boolean;
  cwd: string | null;
  onStart: () => void;
  onStop: () => void;
  onRunLine: (line: string) => void;
};

export function TerminalPanel({
  output,
  running,
  cwd,
  onStart,
  onStop,
  onRunLine,
}: Props) {
  const [line, setLine] = useState("");
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="terminal-panel">
      <div className="terminal-toolbar">
        <span className="mono dim" title={cwd || undefined}>
          {cwd || "No workspace cwd"}
        </span>
        <div className="terminal-actions">
          {!running ? (
            <button type="button" className="btn btn-primary" onClick={onStart}>
              Start shell
            </button>
          ) : (
            <button type="button" className="btn" onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>
      <pre className="terminal-output" ref={preRef}>
        {output || (running ? "" : "Start a shell to run commands in the workspace.")}
      </pre>
      <form
        className="terminal-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!line.trim()) return;
          onRunLine(line);
          setLine("");
        }}
      >
        <span className="prompt">›</span>
        <input
          className="terminal-input"
          value={line}
          placeholder={running ? "Type a command…" : "Start shell first"}
          disabled={!running}
          onChange={(e) => setLine(e.target.value)}
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary" disabled={!running}>
          Run
        </button>
      </form>
    </div>
  );
}
