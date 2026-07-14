export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export type OpenTab = {
  path: string;
  name: string;
  content: string;
  original: string;
  language: string;
  dirty: boolean;
};

export type ChatRole = "user" | "assistant" | "system" | "tool" | "thought";

export type ChatImage = {
  id: string;
  name: string;
  mimeType: string;
  /** Base64 without data: prefix */
  data: string;
  previewUrl: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
  meta?: string;
  images?: ChatImage[];
};

export type AuthStatus = {
  loggedIn: boolean;
  authPath: string;
  hasApiKey: boolean;
};

export type AgentStatus = {
  running: boolean;
  sessionId: string | null;
  cwd: string | null;
  busy: boolean;
  lastError: string | null;
};

export type SidebarView = "explorer" | "search" | "changes" | "terminal" | "settings";

export type PermissionRequest = {
  requestId: number | string;
  sessionId?: string;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    kind?: string;
  };
  options?: Array<{ optionId: string; name?: string; kind?: string }>;
};

export type FileDiffLine = {
  type: "context" | "add" | "del";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
  unified: string;
  lines: FileDiffLine[];
  isNew: boolean;
  isDeleted: boolean;
};

export type PendingChange = {
  path: string;
  before: string;
  after: string;
  status: "pending" | "applied" | "rejected";
};
