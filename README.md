# AgentX

<p align="center">
  <img src="assets/cover.png" alt="AgentX (codename AbeX) — VS Code-style desktop shell for the Grok coding agent" width="100%" />
</p>

**AgentX** — VS Code–style desktop shell for the [Grok](https://x.ai) coding agent.  
**Codename:** AbeX

Edit code, chat with Grok, approve tools, review diffs, and run a real terminal — all powered by your local **Grok CLI** account.

| | |
|---|---|
| **Product** | AgentX |
| **Codename** | AbeX |
| **Author** | Abe Prangishvili |
| **Version** | 1.1.1 |
| **License** | MIT |
| **Repo** | [github.com/prangishviliAbe/AgentX](https://github.com/prangishviliAbe/AgentX) |

Full release notes: **[CHANGELOG.md](./CHANGELOG.md)**

---

## Features

- **Explorer + Monaco editor** — open a folder, edit files, save with Ctrl/Cmd+S  
- **Grok chat** — ACP stream over `grok agent stdio` (same login as the CLI)  
- **Thinking (live)** — optional live thought stream in the chat panel  
- **Auto-continue** — header **Auto** toggle; keeps going when the model only posts a short plan  
- **Plan first** — for create/build/game work, plan + confirm before writing files  
- **Screenshots / images** — paste (Ctrl+V) or **Attach** for visual analysis  
- **Tool permissions** — Allow/Deny modal, or auto-approve in Settings  
- **Stop** — cancel a stuck turn and unlock the composer  
- **Changes / diffs** — unified diff of agent edits; Apply or Reject  
- **Integrated terminal** — real PowerShell/shell in the workspace cwd  
- **Windows installer** — `npm run dist` → NSIS setup under `release/`

---

## Changelog

### 1.1.1 — 2026-07-14

**Added**

- Markdown rendering for assistant replies (headings, bold, lists, code)
- **Activity rail** + header **Active** pill while the agent thinks/works
- Immediate busy feedback on Send (before the first ACP chunk)

**Fixed / Changed**

- No more raw `**` / `###` in chat
- Polished message cards, role badges, and status-bar busy state
- Activity status stays accurate (Thinking / Tool / Writing)

### 1.1.0 — 2026-07-14

Auto-continue header toggle, plan-first mode, show thinking, image attach, Stop, ACP fs/terminal handlers, branding (AgentX / codename AbeX). Reliability fixes for PowerShell spawn and stuck busy state.

### 1.0.0 — 2026-07-14

Initial public release: explorer, Monaco, Grok chat, permissions, diffs, terminal, and Windows packaging.

See **[CHANGELOG.md](./CHANGELOG.md)** for the full list.

---

## Requirements

- **Windows** (primary), also macOS / Linux  
- [Node.js](https://nodejs.org/) **20+**  
- [Grok CLI](https://x.ai/cli) installed  
- Grok account (`grok login`)

### Install Grok CLI (Windows PowerShell)

```powershell
irm https://x.ai/cli/install.ps1 | iex
grok --version
grok login
```

---

## Quick start

```bash
git clone https://github.com/prangishviliAbe/AgentX.git
cd AgentX
npm install
npm run dev
```

First launch:

1. **Open Folder** — choose a project  
2. **Settings** → confirm **Signed in** (or **Login with Grok**)  
3. Chat header → turn **Auto** on (optional)  
4. Settings → **Plan first** / **Show thinking** as you prefer  
5. Chat in the right panel  
6. **Changes** — review agent file edits  
7. **Terminal** — shell in the workspace  

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development (Vite + Electron) |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Production build |
| `npm run pack` | Unpackaged app → `release/win-unpacked/` |
| `npm run dist` | Windows installer → `release/AgentX Setup *.exe` |

---

## Installer (Windows)

```bash
npm run dist
```

Artifacts:

- `release/AgentX Setup 1.1.1.exe` — installer  
- `release/win-unpacked/AgentX.exe` — portable run  

---

## Usage tips

| Action | How |
|--------|-----|
| Open folder | Title bar **Open Folder** or Ctrl/Cmd+O |
| Save file | Ctrl/Cmd+S |
| Focus terminal | Ctrl/Cmd+\` (backtick) |
| Auto-continue | Chat header **Auto** (or Settings) |
| Plan before build | Settings → **Plan first** |
| Show thinking | Settings → **Show thinking process** |
| Stop a stuck turn | Chat header **Stop** |
| Tool prompts | Settings → uncheck **Auto-approve tool calls** |
| Apply agent edits | **Changes** → Apply / Reject |
| Login | Settings → **Login with Grok** |
| Paste screenshot | Focus chat → **Ctrl+V** (or **Attach**) |

AgentX reuses credentials from `~/.grok/auth.json` (same as CLI). Set `GROK_BIN` if `grok` is not on `PATH`.

Preferences are saved in `~/.agentx/settings.json`.

Workspace files are available to Grok over ACP `fs/read_text_file`.

---

## Architecture

```
┌──────────────────────────────────┐
│  AgentX (Electron + React UI)    │
│  Explorer · Diff · Term · Chat   │
│  codename AbeX                   │
└──────────────┬───────────────────┘
               │ IPC
┌──────────────▼───────────────────┐
│  Main process                    │
│  FS · Diff · Shell · ACP client  │
└──────────────┬───────────────────┘
               │ JSON-RPC / stdio
┌──────────────▼───────────────────┐
│  grok agent stdio                │
│  ~/.grok/auth.json               │
└──────────────────────────────────┘
```

Stack: **Electron · React · TypeScript · Monaco · Vite · electron-builder**

---

## Project layout

```
AgentX/
  electron/          # main process, ACP, FS, terminal, settings
  src/               # React UI
  tests/             # unit tests
  assets/            # cover image
  CHANGELOG.md
  package.json
```

---

## Development

```bash
npm install
npm run dev
npm test
npm run typecheck
```

If Electron’s binary is missing after install:

```bash
node node_modules/electron/install.js
# or
npm run postinstall
```

---

## Roadmap

- [ ] Session history & resume  
- [ ] Search in files  
- [ ] Auto-update  
- [ ] Signed installers & custom app icon  
- [ ] Themes  

---

## License

MIT © Abe Prangishvili

Not affiliated with xAI. Grok® is a product of xAI. AgentX is an independent open-source shell around the public Grok CLI / ACP interface.
