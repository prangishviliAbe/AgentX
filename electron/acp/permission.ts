/**
 * Pure helpers for ACP permission request handling.
 * Used by GrokAcpClient and unit tests without spawning the agent.
 */

export type PermissionOption = {
  optionId: string;
  name?: string;
  kind?: string;
};

export type PermissionRequestPayload = {
  requestId: number | string;
  sessionId?: string;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    kind?: string;
    rawInput?: unknown;
  };
  options?: PermissionOption[];
};

export type PermissionDecision = "allow" | "deny";

export type PermissionResponseShape = {
  jsonrpc: "2.0";
  id: number | string;
  result: {
    outcome: {
      outcome: "selected";
      optionId: string;
    };
  };
};

/** Prefer ACP option ids when present; fall back to common allow/deny ids. */
export function resolveOptionId(
  decision: PermissionDecision,
  options?: PermissionOption[],
): string {
  if (options?.length) {
    const allowLike = options.find((o) =>
      /allow|approve|yes|accept/i.test(`${o.optionId} ${o.name ?? ""} ${o.kind ?? ""}`),
    );
    const denyLike = options.find((o) =>
      /deny|reject|no|cancel/i.test(`${o.optionId} ${o.name ?? ""} ${o.kind ?? ""}`),
    );
    if (decision === "allow" && allowLike) return allowLike.optionId;
    if (decision === "deny" && denyLike) return denyLike.optionId;
    // First option often allow-once; last often deny
    if (decision === "allow") return options[0].optionId;
    return options[options.length - 1].optionId;
  }
  return decision === "allow" ? "allow-once" : "reject-once";
}

/** Build the JSON-RPC response the agent expects for a permission choice. */
export function buildPermissionResponse(
  requestId: number | string,
  decision: PermissionDecision,
  options?: PermissionOption[],
): PermissionResponseShape {
  return {
    jsonrpc: "2.0",
    id: requestId,
    result: {
      outcome: {
        outcome: "selected",
        optionId: resolveOptionId(decision, options),
      },
    },
  };
}

/** Normalize raw ACP params + message id into a UI-ready permission request. */
export function normalizePermissionRequest(
  messageId: number | string,
  params: Record<string, unknown> | null | undefined,
): PermissionRequestPayload {
  const p = params || {};
  const toolCall = (p.toolCall || p.tool_call || {}) as PermissionRequestPayload["toolCall"];
  const options = (p.options || p.permissionOptions || []) as PermissionOption[];
  return {
    requestId: messageId,
    sessionId: typeof p.sessionId === "string" ? p.sessionId : undefined,
    toolCall: {
      toolCallId:
        toolCall?.toolCallId ||
        (typeof (p as { toolCallId?: string }).toolCallId === "string"
          ? (p as { toolCallId: string }).toolCallId
          : undefined),
      title: toolCall?.title || (typeof p.title === "string" ? p.title : undefined),
      kind: toolCall?.kind || (typeof p.kind === "string" ? p.kind : undefined),
      rawInput: toolCall?.rawInput ?? p.rawInput,
    },
    options: Array.isArray(options) ? options : [],
  };
}

/** Always-approve auto-response (silent path). */
export function buildAlwaysApproveResponse(
  requestId: number | string,
  options?: PermissionOption[],
): PermissionResponseShape {
  return buildPermissionResponse(requestId, "allow", options);
}
