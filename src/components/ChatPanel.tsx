import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "../lib/markdown";
import type { ChatImage, ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  disabledReason: string | null;
  canContinue?: boolean;
  autoContinue?: boolean;
  onToggleAutoContinue?: (value: boolean) => void;
  activityHint?: string | null;
  liveThought?: string;
  showThinking?: boolean;
  onContinue?: () => void;
  onStop?: () => void;
  onSend: (text: string, images: ChatImage[]) => void;
  onClear: () => void;
  onPickImages: () => Promise<ChatImage[]>;
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToChatImage(file: File): Promise<ChatImage> {
  const buf = await file.arrayBuffer();
  if (buf.byteLength > 8_000_000) {
    throw new Error(`Image too large (>8MB): ${file.name}`);
  }
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const data = btoa(binary);
  const mimeType = file.type || "image/png";
  return {
    id: uid(),
    name: file.name || "pasted-image.png",
    mimeType,
    data,
    previewUrl: `data:${mimeType};base64,${data}`,
  };
}

function roleLabel(role: ChatMessage["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Assistant";
    case "thought":
      return "Thinking";
    case "tool":
      return "Tool";
    case "system":
      return "System";
    default:
      return role;
  }
}

export function ChatPanel({
  messages,
  busy,
  disabledReason,
  canContinue,
  autoContinue,
  onToggleAutoContinue,
  activityHint,
  liveThought,
  showThinking = true,
  onContinue,
  onStop,
  onSend,
  onClear,
  onPickImages,
}: Props) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const thoughtEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, liveThought, activityHint]);

  useEffect(() => {
    if (liveThought) {
      thoughtEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [liveThought]);

  const addImages = async (files: FileList | File[]) => {
    setAttachError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      setAttachError("Only image files can be attached.");
      return;
    }
    try {
      const imgs = await Promise.all(list.map(fileToChatImage));
      setAttachments((prev) => [...prev, ...imgs].slice(0, 8));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (disabledReason) return;
    if (!text && attachments.length === 0) return;
    const payload = { text, images: attachments };
    setDraft("");
    setAttachments([]);
    setAttachError(null);
    if (busy && onStop) {
      onStop();
      window.setTimeout(() => onSend(payload.text, payload.images), 120);
      return;
    }
    onSend(payload.text, payload.images);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">Grok</span>
          {busy ? (
            <span
              className="status-pill active"
              title={activityHint || "Agent is working"}
            >
              <span className="status-dot-live" />
              Active
              <span className="status-pill-hint">
                {" "}
                · {activityHint || "Thinking…"}
              </span>
            </span>
          ) : (
            <span className="status-pill idle">Ready</span>
          )}
        </div>
        <div className="chat-header-actions">
          {onToggleAutoContinue && (
            <label
              className={`auto-chip ${autoContinue ? "on" : ""}`}
              title="Auto-continue incomplete answers"
            >
              <input
                type="checkbox"
                checked={Boolean(autoContinue)}
                onChange={(e) => onToggleAutoContinue(e.target.checked)}
              />
              <span>Auto</span>
            </label>
          )}
          {busy && onStop && (
            <button type="button" className="btn" onClick={onStop}>
              Stop
            </button>
          )}
          {!autoContinue && canContinue && onContinue && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (busy && onStop) onStop();
                window.setTimeout(() => onContinue(), busy ? 80 : 0);
              }}
            >
              Continue
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !busy && (
          <div className="msg system empty-chat">
            <strong>Chat with Grok</strong>
            <span>
              Ask about the open folder, paste a screenshot, or request a plan.
              Tools run through your local <code>grok agent</code>.
            </span>
          </div>
        )}

        {messages.map((m) => {
          // Live thoughts stream in the activity rail — avoid duplicate history while streaming
          if (m.role === "thought") {
            if (!showThinking) return null;
            if (m.streaming && busy) return null;
          }
          return (
            <article key={m.id} className={`msg msg-card ${m.role}`}>
              <header className="msg-role">
                <span className={`role-badge role-${m.role}`}>
                  {roleLabel(m.role)}
                </span>
                {m.streaming ? (
                  <span className="live-tag">
                    <span className="status-dot-live sm" />
                    live
                  </span>
                ) : null}
                {m.meta ? <span className="msg-meta">{m.meta}</span> : null}
              </header>
              {m.images && m.images.length > 0 && (
                <div className="msg-images">
                  {m.images.map((img) => (
                    <img
                      key={img.id}
                      src={img.previewUrl}
                      alt={img.name}
                      title={img.name}
                      className="msg-thumb"
                    />
                  ))}
                </div>
              )}
              <div className="msg-body">
                {m.role === "assistant"
                  ? renderMarkdown(m.content || (m.streaming ? "…" : ""))
                  : m.role === "system"
                    ? m.content.includes("**") || m.content.includes("###")
                      ? renderMarkdown(m.content)
                      : m.content || (m.streaming ? "…" : "")
                    : m.content || (m.streaming ? "…" : "")}
              </div>
            </article>
          );
        })}

        {/* Always-visible while busy — immediate feedback before first chunk */}
        {busy && (
          <div className="activity-rail" aria-live="polite" aria-busy="true">
            <div className="activity-rail-top">
              <span className="status-dot-live" />
              <strong>{activityHint || "Thinking… agent is active"}</strong>
            </div>
            {showThinking && liveThought ? (
              <div className="activity-thought">
                <div className="activity-thought-label">Thinking</div>
                <div className="activity-thought-text">{liveThought}</div>
                <div ref={thoughtEndRef} />
              </div>
            ) : showThinking ? (
              <div className="thinking-skeleton" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            ) : null}
            <div className="activity-rail-foot">
              {activityHint && /quiet|without stream|Still working/i.test(activityHint)
                ? (
                  <>
                    Taking longer than usual — press <strong>Stop</strong> to unlock, then Continue.
                  </>
                )
                : autoContinue
                  ? "Auto-continue is on — finishing when the agent only posts a short plan."
                  : (
                    <>
                      Press <strong>Stop</strong> if this hangs.
                    </>
                  )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        {disabledReason && (
          <div className="composer-alert">{disabledReason}</div>
        )}
        {attachError && (
          <div className="composer-alert error">{attachError}</div>
        )}
        {attachments.length > 0 && (
          <div className="attach-row">
            {attachments.map((img) => (
              <div key={img.id} className="attach-chip">
                <img src={img.previewUrl} alt={img.name} />
                <button
                  type="button"
                  className="attach-remove"
                  title="Remove"
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((a) => a.id !== img.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          placeholder={
            busy
              ? "Agent is active — you can still type; Stop unlocks a stuck turn…"
              : "Message Grok… (Enter to send, Shift+Enter for newline)"
          }
          disabled={Boolean(disabledReason)}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (const item of Array.from(items)) {
              if (item.type.startsWith("image/")) {
                const f = item.getAsFile();
                if (f) files.push(f);
              }
            }
            if (files.length) {
              e.preventDefault();
              void addImages(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addImages(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="composer-row">
          <div className="composer-actions">
            <button
              type="button"
              className="btn"
              disabled={Boolean(disabledReason)}
              title="Attach images"
              onClick={() => {
                void (async () => {
                  try {
                    const fromDialog = await onPickImages();
                    if (fromDialog.length) {
                      setAttachments((prev) =>
                        [...prev, ...fromDialog].slice(0, 8),
                      );
                      return;
                    }
                  } catch {
                    // fall through
                  }
                  fileInputRef.current?.click();
                })();
              }}
            >
              Attach
            </button>
            <span className="composer-hint">
              {busy
                ? autoContinue
                  ? "Auto on · agent continues on its own"
                  : "Agent active · Stop if stuck"
                : attachments.length
                  ? `${attachments.length} image(s)`
                  : autoContinue
                    ? "Auto on"
                    : "Auto off"}
            </span>
          </div>
          {busy ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onStop?.()}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                Boolean(disabledReason) ||
                (!draft.trim() && attachments.length === 0)
              }
              onClick={submit}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
