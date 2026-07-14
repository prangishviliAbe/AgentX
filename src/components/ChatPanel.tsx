import { useEffect, useRef, useState } from "react";
import type { ChatImage, ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  disabledReason: string | null;
  canContinue?: boolean;
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

export function ChatPanel({
  messages,
  busy,
  disabledReason,
  canContinue,
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

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
    // If a turn is stuck "busy", unlock then send
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
        <span>
          Grok
          {busy ? (
            <span className="chat-busy-label"> · working…</span>
          ) : null}
        </span>
        <div className="chat-header-actions">
          {busy && onStop && (
            <button
              type="button"
              className="btn"
              title="Stop stuck turn and unlock chat"
              onClick={onStop}
            >
              Stop
            </button>
          )}
          {canContinue && onContinue && (
            <button
              type="button"
              className="btn btn-primary"
              title="Force agent to continue"
              onClick={() => {
                if (busy && onStop) onStop();
                // slight delay so cancel lands before new prompt
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
        {messages.length === 0 && (
          <div className="msg system">
            Ask Grok to explore, edit, or explain code. Paste or attach
            screenshots for visual analysis. Tools run via local{" "}
            <code>grok agent</code>.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">
              {m.role}
              {m.streaming ? " · streaming" : ""}
              {m.meta ? ` · ${m.meta}` : ""}
            </div>
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
            {m.content || (m.streaming ? "…" : "")}
          </div>
        ))}
        {busy && (
          <div className="msg system busy-banner">
            მუშაობს… თუ გაიჭედა, დააჭირე <strong>Stop</strong>, შემდეგ{" "}
            <strong>Continue</strong> ან ახალი შეტყობინება.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        {disabledReason && (
          <div className="msg system" style={{ margin: 0 }}>
            {disabledReason}
          </div>
        )}
        {attachError && (
          <div className="msg system" style={{ margin: 0, color: "#ffb3b3" }}>
            {attachError}
          </div>
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
              ? "შეგიძლია აკრიფო — Send/Stop განბლოკავს გაჭედილ turn-ს…"
              : "Message Grok… Paste screenshot (Ctrl+V), attach image, Enter to send"
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
              🖼 Attach
            </button>
            <span className="composer-hint">
              {busy
                ? "Working… use Stop if stuck"
                : attachments.length
                  ? `${attachments.length} image(s) · paste OK`
                  : canContinue
                    ? "Auto-continue off — press Continue if incomplete"
                    : "Paste or attach screenshots"}
            </span>
          </div>
          {busy ? (
            <button
              type="button"
              className="btn btn-primary"
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
