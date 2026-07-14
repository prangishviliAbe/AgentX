import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export type AuthStatus = {
  loggedIn: boolean;
  authPath: string;
  hasApiKey: boolean;
};

export type AppInfo = {
  version: string;
  platform: string;
  grokBinary: string;
  auth: AuthStatus;
  alwaysApprove?: boolean;
};

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:get-info"),
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke("auth:status"),
  login: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("auth:login"),

  getSettings: (): Promise<{ alwaysApprove: boolean }> =>
    ipcRenderer.invoke("settings:get"),
  setAlwaysApprove: (value: boolean) =>
    ipcRenderer.invoke("settings:set-always-approve", value),

  openWorkspace: (): Promise<string | null> =>
    ipcRenderer.invoke("workspace:open"),
  getWorkspace: (): Promise<string | null> =>
    ipcRenderer.invoke("workspace:get"),
  setWorkspace: (folder: string): Promise<string> =>
    ipcRenderer.invoke("workspace:set", folder),

  listTree: (root?: string): Promise<FileNode[]> =>
    ipcRenderer.invoke("fs:list-tree", root),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("fs:read-file", filePath),
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:write-file", filePath, content),

  acpStart: (cwd?: string) => ipcRenderer.invoke("acp:start", cwd),
  acpStop: () => ipcRenderer.invoke("acp:stop"),
  acpPrompt: (
    text: string,
    snapshotPaths?: string[],
    images?: Array<{ mimeType: string; data: string; uri?: string }>,
  ) => ipcRenderer.invoke("acp:prompt", text, snapshotPaths, images),
  acpStatus: () => ipcRenderer.invoke("acp:status"),
  openImages: () => ipcRenderer.invoke("dialog:open-images"),
  acpPermissionResponse: (
    requestId: number | string,
    decisionOrOptionId: string,
    options?: Array<{ optionId: string; name?: string; kind?: string }>,
  ) =>
    ipcRenderer.invoke(
      "acp:permission-response",
      requestId,
      decisionOrOptionId,
      options,
    ),

  changesList: () => ipcRenderer.invoke("changes:list"),
  changesWatch: (filePath: string) =>
    ipcRenderer.invoke("changes:watch", filePath),
  changesDecide: (filePath: string, decision: "apply" | "reject") =>
    ipcRenderer.invoke("changes:decide", filePath, decision),
  changesDecideAll: (decision: "apply" | "reject") =>
    ipcRenderer.invoke("changes:decide-all", decision),

  termStart: (cwd?: string) => ipcRenderer.invoke("term:start", cwd),
  termStop: () => ipcRenderer.invoke("term:stop"),
  termWrite: (text: string) => ipcRenderer.invoke("term:write", text),
  termRunLine: (line: string) => ipcRenderer.invoke("term:run-line", line),
  termStatus: () => ipcRenderer.invoke("term:status"),

  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapper = (_event: IpcRendererEvent, ...args: unknown[]) =>
      listener(...args);
    ipcRenderer.on(channel, wrapper);
    return () => ipcRenderer.removeListener(channel, wrapper);
  },
};

contextBridge.exposeInMainWorld("agentx", api);

export type AgentXApi = typeof api;
