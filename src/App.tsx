import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityBar } from "./components/ActivityBar";
import { ChatPanel } from "./components/ChatPanel";
import { EditorArea } from "./components/EditorArea";
import { PermissionModal } from "./components/PermissionModal";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { fileName, languageFromPath } from "./lib/language";
import type {
  AgentStatus,
  AuthStatus,
  ChatImage,
  ChatMessage,
  FileDiff,
  FileNode,
  OpenTab,
  PermissionRequest,
  SidebarView,
} from "./types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [view, setView] = useState<SidebarView>("explorer");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [grokBinary, setGrokBinary] = useState("");
  const [alwaysApprove, setAlwaysApprove] = useState(true);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [termOutput, setTermOutput] = useState("");
  const [termRunning, setTermRunning] = useState(false);
  const [termCwd, setTermCwd] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentStatus>({
    running: false,
    sessionId: null,
    cwd: null,
    busy: false,
    lastError: null,
  });

  const streamingId = useRef<string | null>(null);
  const thoughtId = useRef<string | null>(null);

  const refreshAuth = useCallback(async () => {
    const status = await window.agentx.getAuthStatus();
    setAuth(status);
  }, []);

  const refreshTree = useCallback(async (root?: string) => {
    const nodes = await window.agentx.listTree(root);
    setTree(nodes);
  }, []);

  const refreshChanges = useCallback(async () => {
    const res = (await window.agentx.changesList()) as {
      diffs?: FileDiff[];
    };
    setDiffs(res.diffs || []);
  }, []);

  const bootstrap = useCallback(async () => {
    const info = await window.agentx.getAppInfo();
    setAuth(info.auth);
    setGrokBinary(info.grokBinary);
    if (typeof info.alwaysApprove === "boolean") {
      setAlwaysApprove(info.alwaysApprove);
    }
    const settings = await window.agentx.getSettings();
    setAlwaysApprove(settings.alwaysApprove);

    const ws = await window.agentx.getWorkspace();
    if (ws) {
      setWorkspace(ws);
      await refreshTree(ws);
    }
    await refreshChanges();
  }, [refreshTree, refreshChanges]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const offs = [
      window.agentx.on("acp:update", (updateUnknown) => {
        const update = updateUnknown as {
          sessionUpdate?: string;
          content?: { text?: string };
          title?: string;
          status?: string;
          kind?: string;
        };

        const kind = update.sessionUpdate || "";

        if (kind === "agent_message_chunk") {
          const chunk = update.content?.text || "";
          if (!chunk) return;

          setMessages((prev) => {
            const id = streamingId.current;
            if (id) {
              return prev.map((m) =>
                m.id === id
                  ? { ...m, content: m.content + chunk, streaming: true }
                  : m,
              );
            }
            const newId = uid();
            streamingId.current = newId;
            return [
              ...prev,
              {
                id: newId,
                role: "assistant",
                content: chunk,
                streaming: true,
              },
            ];
          });
          return;
        }

        if (kind === "agent_thought_chunk") {
          const chunk = update.content?.text || "";
          if (!chunk) return;
          setMessages((prev) => {
            const id = thoughtId.current;
            if (id) {
              return prev.map((m) =>
                m.id === id ? { ...m, content: m.content + chunk } : m,
              );
            }
            const newId = uid();
            thoughtId.current = newId;
            return [...prev, { id: newId, role: "thought", content: chunk }];
          });
          return;
        }

        if (kind === "tool_call" || kind === "tool_call_update") {
          if (streamingId.current) {
            const id = streamingId.current;
            streamingId.current = null;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
            );
          }
          thoughtId.current = null;

          const title = update.title || "tool";
          const status =
            update.status || (kind === "tool_call" ? "running" : "");
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "tool",
              content: status ? `${title} · ${status}` : title,
              meta: update.kind,
            },
          ]);
        }
      }),

      window.agentx.on("acp:permission", (reqUnknown) => {
        setPermission(reqUnknown as PermissionRequest);
      }),

      window.agentx.on("changes:updated", (payloadUnknown) => {
        const payload = payloadUnknown as { diffs?: FileDiff[] };
        if (payload.diffs) {
          setDiffs(payload.diffs);
          if (payload.diffs.length && !selectedDiffPath) {
            setSelectedDiffPath(payload.diffs[0].path);
          }
        }
      }),

      window.agentx.on("term:data", (payloadUnknown) => {
        const payload = payloadUnknown as { text?: string };
        if (payload.text) {
          setTermOutput((prev) => prev + payload.text);
        }
      }),

      window.agentx.on("term:ready", (infoUnknown) => {
        const info = infoUnknown as { cwd?: string };
        setTermRunning(true);
        if (info.cwd) setTermCwd(info.cwd);
      }),

      window.agentx.on("term:exit", () => {
        setTermRunning(false);
        setTermOutput((prev) => prev + "\n[shell exited]\n");
      }),

      window.agentx.on("term:error", (errUnknown) => {
        const err = errUnknown as { message?: string };
        setTermOutput((prev) => prev + `\n[error] ${err.message || "shell error"}\n`);
      }),

      window.agentx.on("acp:ready", (infoUnknown) => {
        const info = infoUnknown as { sessionId?: string; cwd?: string };
        setAgent((a) => ({
          ...a,
          running: true,
          sessionId: info.sessionId || null,
          cwd: info.cwd || a.cwd,
          lastError: null,
        }));
      }),

      window.agentx.on("acp:error", (errUnknown) => {
        const err = errUnknown as { message?: string };
        setAgent((a) => ({
          ...a,
          lastError: err.message || "Agent error",
          busy: false,
        }));
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "system",
            content: err.message || "Agent error",
          },
        ]);
      }),

      window.agentx.on("acp:exit", () => {
        setAgent((a) => ({
          ...a,
          running: false,
          busy: false,
          sessionId: null,
        }));
      }),
    ];

    return () => {
      offs.forEach((off) => off());
    };
  }, [selectedDiffPath]);

  const openFolder = async () => {
    const folder = await window.agentx.openWorkspace();
    if (!folder) return;
    setWorkspace(folder);
    setTabs([]);
    setActivePath(null);
    setDiffs([]);
    setTermCwd(folder);
    await refreshTree(folder);
    setAgent((a) => ({ ...a, cwd: folder, lastError: null }));
    await refreshAuth();
  };

  const startAgent = async () => {
    try {
      const res = (await window.agentx.acpStart(workspace || undefined)) as {
        sessionId?: string;
        cwd?: string;
        auth?: AuthStatus;
        alwaysApprove?: boolean;
      };
      if (res.auth) setAuth(res.auth);
      if (typeof res.alwaysApprove === "boolean") {
        setAlwaysApprove(res.alwaysApprove);
      }
      setAgent((a) => ({
        ...a,
        running: true,
        sessionId: res.sessionId || null,
        cwd: res.cwd || workspace,
        lastError: null,
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          content: "Grok agent connected.",
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAgent((a) => ({ ...a, lastError: message, running: false }));
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", content: message },
      ]);
    }
  };

  const openFile = async (node: FileNode) => {
    if (node.type !== "file") return;
    const existing = tabs.find((t) => t.path === node.path);
    if (existing) {
      setActivePath(node.path);
      return;
    }
    try {
      const content = await window.agentx.readFile(node.path);
      void window.agentx.changesWatch(node.path);
      const tab: OpenTab = {
        path: node.path,
        name: fileName(node.path),
        content,
        original: content,
        language: languageFromPath(node.path),
        dirty: false,
      };
      setTabs((prev) => [...prev, tab]);
      setActivePath(node.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", content: message },
      ]);
    }
  };

  const saveTab = async (path: string) => {
    const tab = tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.agentx.writeFile(path, tab.content);
    setTabs((prev) =>
      prev.map((t) =>
        t.path === path ? { ...t, original: t.content, dirty: false } : t,
      ),
    );
  };

  const sendPrompt = async (text: string, images: ChatImage[] = []) => {
    streamingId.current = null;
    thoughtId.current = null;

    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content:
          text ||
          (images.length
            ? `[${images.length} image(s) attached for analysis]`
            : ""),
        images: images.length ? images : undefined,
      },
    ]);
    setAgent((a) => ({ ...a, busy: true, lastError: null }));

    try {
      // Always ensure a live agent process (reconnect if previous session died)
      const st = (await window.agentx.acpStatus()) as { running?: boolean };
      if (!st.running) {
        await startAgent();
      }
      const snapshotPaths = tabs.map((t) => t.path);
      await window.agentx.acpPrompt(
        text,
        snapshotPaths,
        images.map((img) => ({
          mimeType: img.mimeType,
          data: img.data,
          uri: img.name ? `attachment://${img.name}` : undefined,
        })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", content: message },
      ]);
      setAgent((a) => ({ ...a, lastError: message, running: false }));
    } finally {
      if (streamingId.current) {
        const id = streamingId.current;
        streamingId.current = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        );
      }
      thoughtId.current = null;
      setAgent((a) => ({ ...a, busy: false }));
      if (workspace) void refreshTree(workspace);
      void refreshChanges();
    }
  };

  const respondPermission = async (decision: "allow" | "deny") => {
    if (!permission) return;
    await window.agentx.acpPermissionResponse(
      permission.requestId,
      decision,
      permission.options,
    );
    setPermission(null);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "system",
        content: `Tool ${decision === "allow" ? "allowed" : "denied"}: ${permission.toolCall?.title || permission.requestId}`,
      },
    ]);
  };

  const applyDiff = async (path: string) => {
    const result = (await window.agentx.changesDecide(path, "apply")) as {
      content?: string;
    } | null;
    await refreshChanges();
    if (result?.content != null) {
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? {
                ...t,
                content: result.content!,
                original: result.content!,
                dirty: false,
              }
            : t,
        ),
      );
    }
  };

  const rejectDiff = async (path: string) => {
    const result = (await window.agentx.changesDecide(path, "reject")) as {
      content?: string;
    } | null;
    await refreshChanges();
    if (result?.content != null) {
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? {
                ...t,
                content: result.content!,
                original: result.content!,
                dirty: false,
              }
            : t,
        ),
      );
    }
  };

  const activeTab = tabs.find((t) => t.path === activePath) || null;

  const disabledReason = useMemo(() => {
    if (!auth?.loggedIn) {
      return "Sign in with your Grok account (Settings → Login with Grok).";
    }
    if (!workspace) {
      return "Open a folder first so Grok has a workspace.";
    }
    return null;
  }, [auth, workspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (activePath) void saveTab(activePath);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFolder();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "`") {
        e.preventDefault();
        setView("terminal");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePath]);

  return (
    <div className="app-shell">
      <TitleBar
        workspace={workspace}
        onOpenFolder={() => void openFolder()}
        onSave={() => activePath && void saveTab(activePath)}
        canSave={Boolean(activeTab?.dirty)}
      />

      <div className="main-row">
        <ActivityBar
          active={view}
          onChange={setView}
          changeCount={diffs.length}
        />
        <Sidebar
          view={view}
          tree={tree}
          activePath={activePath}
          workspace={workspace}
          auth={auth}
          grokBinary={grokBinary}
          alwaysApprove={alwaysApprove}
          diffs={diffs}
          selectedDiffPath={selectedDiffPath}
          termOutput={termOutput}
          termRunning={termRunning}
          termCwd={termCwd}
          onOpenFile={(n) => void openFile(n)}
          onOpenFolder={() => void openFolder()}
          onLogin={async () => {
            const res = await window.agentx.login();
            setMessages((prev) => [
              ...prev,
              {
                id: uid(),
                role: "system",
                content: res.message,
              },
            ]);
            setTimeout(() => void refreshAuth(), 2500);
          }}
          onRefreshAuth={() => void refreshAuth()}
          onStartAgent={() => void startAgent()}
          onToggleAlwaysApprove={(value) => {
            setAlwaysApprove(value);
            void window.agentx.setAlwaysApprove(value);
          }}
          onSelectDiff={setSelectedDiffPath}
          onApplyDiff={(p) => void applyDiff(p)}
          onRejectDiff={(p) => void rejectDiff(p)}
          onApplyAll={() => {
            void window.agentx.changesDecideAll("apply").then(() => {
              void refreshChanges();
            });
          }}
          onRejectAll={() => {
            void window.agentx.changesDecideAll("reject").then(() => {
              void refreshChanges();
              if (workspace) void refreshTree(workspace);
            });
          }}
          onTermStart={() => {
            void window.agentx.termStart(workspace || undefined).then((s) => {
              const st = s as { running?: boolean; cwd?: string };
              setTermRunning(Boolean(st.running));
              if (st.cwd) setTermCwd(st.cwd);
            });
          }}
          onTermStop={() => {
            void window.agentx.termStop();
            setTermRunning(false);
          }}
          onTermRunLine={(line) => {
            setTermOutput((prev) => prev + `\n› ${line}\n`);
            void window.agentx.termRunLine(line);
          }}
        />
        <EditorArea
          tabs={tabs}
          activePath={activePath}
          onSelectTab={setActivePath}
          onCloseTab={(path) => {
            setTabs((prev) => {
              const next = prev.filter((t) => t.path !== path);
              if (activePath === path) {
                setActivePath(next[next.length - 1]?.path ?? null);
              }
              return next;
            });
          }}
          onChangeContent={(path, content) => {
            setTabs((prev) =>
              prev.map((t) =>
                t.path === path
                  ? {
                      ...t,
                      content,
                      dirty: content !== t.original,
                    }
                  : t,
              ),
            );
          }}
          onSave={(path) => void saveTab(path)}
          onOpenFolder={() => void openFolder()}
        />
        <ChatPanel
          messages={messages}
          busy={agent.busy}
          disabledReason={disabledReason}
          onSend={(text, images) => void sendPrompt(text, images)}
          onPickImages={async () => {
            const picked = (await window.agentx.openImages()) as Array<{
              name: string;
              mimeType: string;
              data: string;
              previewUrl: string;
            }>;
            return picked.map((p) => ({
              id: uid(),
              name: p.name,
              mimeType: p.mimeType,
              data: p.data,
              previewUrl: p.previewUrl,
            }));
          }}
          onClear={() => {
            streamingId.current = null;
            thoughtId.current = null;
            setMessages([]);
          }}
        />
      </div>

      <StatusBar
        auth={auth}
        agent={agent}
        language={activeTab?.language ?? null}
      />

      <PermissionModal
        request={permission}
        onAllow={() => void respondPermission("allow")}
        onDeny={() => void respondPermission("deny")}
      />
    </div>
  );
}
