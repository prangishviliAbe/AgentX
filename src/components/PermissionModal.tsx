import type { PermissionRequest } from "../types";

type Props = {
  request: PermissionRequest | null;
  onAllow: () => void;
  onDeny: () => void;
};

export function PermissionModal({ request, onAllow, onDeny }: Props) {
  if (!request) return null;

  const title =
    request.toolCall?.title ||
    request.toolCall?.toolCallId ||
    "Tool permission request";
  const kind = request.toolCall?.kind;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title">Allow tool?</div>
        <p className="modal-body">
          Grok wants to run a tool. Choose allow or deny.
        </p>
        <div className="modal-meta">
          <div>
            <strong>Tool</strong>
            <div>{title}</div>
          </div>
          {kind && (
            <div>
              <strong>Kind</strong>
              <div>{kind}</div>
            </div>
          )}
          <div>
            <strong>Request</strong>
            <div className="mono">{String(request.requestId)}</div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onDeny}>
            Deny
          </button>
          <button type="button" className="btn btn-primary" onClick={onAllow}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
