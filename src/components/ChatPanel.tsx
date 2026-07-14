import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  disabledReason: string | null;
  onSend: (text: string) => void;
  onClear: () => void;
};

export function ChatPanel({
  messages,
  busy,
  disabledReason,
  onSend,
  onClear,
}: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || disabledReason) return;
    onSend(text);
    setDraft("");
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Grok</span>
        <button type="button" className="btn btn-ghost" onClick={onClear}>
          Clear
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="msg system">
            Ask Grok to explore, edit, or explain code in the open workspace.
            Tools run through your local <code>grok agent</code>.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">
              {m.role}
              {m.streaming ? " · streaming" : ""}
              {m.meta ? ` · ${m.meta}` : ""}
            </div>
            {m.content || (m.streaming ? "…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        {disabledReason && (
          <div className="msg system" style={{ margin: 0 }}>
            {disabledReason}
          </div>
        )}
        <textarea
          value={draft}
          placeholder="Message Grok… (Enter to send, Shift+Enter for newline)"
          disabled={Boolean(disabledReason)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-row">
          <span className="composer-hint">
            {busy ? "Grok is working…" : "Powered by local Grok CLI"}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !draft.trim() || Boolean(disabledReason)}
            onClick={submit}
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
