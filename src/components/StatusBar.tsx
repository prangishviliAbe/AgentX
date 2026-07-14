import type { AgentStatus, AuthStatus } from "../types";

type Props = {
  auth: AuthStatus | null;
  agent: AgentStatus;
  language: string | null;
}

export function StatusBar({ auth, agent, language }: Props) {
  const mode = agent.lastError
    ? "error"
    : !auth?.loggedIn
      ? "warn"
      : "";

  return (
    <footer className={`status-bar ${mode}`}>
      <div className="status-left">
        <span
          className={`status-dot ${agent.running ? (agent.busy ? "busy" : "") : "off"}`}
          title={agent.running ? "Agent connected" : "Agent offline"}
        />
        <span>
          {agent.running
            ? agent.busy
              ? "Grok · working"
              : "Grok · ready"
            : "Grok · offline"}
        </span>
        {agent.sessionId && (
          <span title={agent.sessionId}>
            session {agent.sessionId.slice(0, 8)}
          </span>
        )}
        {agent.lastError && <span title={agent.lastError}>error</span>}
      </div>
      <div className="status-right">
        <span>{auth?.loggedIn ? "Signed in" : "Not signed in"}</span>
        {language && <span>{language}</span>}
        <span>AbeX</span>
      </div>
    </footer>
  );
}
