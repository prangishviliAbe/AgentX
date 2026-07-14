# Changelog

All notable changes to **AgentX** (codename **AbeX**) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-07-14

### Added

- **Chat Auto toggle** in the Grok panel header — enable/disable auto-continue without opening Settings
- **Plan first** mode — for create/build/game requests, the agent must propose a plan and wait for confirmation before writing files
- **Show thinking** — live “Thinking (live)” stream panel and durable thinking messages in chat
- **Auto-continue** settings (`autoContinue`, `max steps` 1–5), persisted in `~/.agentx/settings.json`
- **Stop** control to cancel a stuck turn and unlock the composer
- **Screenshot / image attach** — paste (Ctrl+V) or Attach button; images sent as ACP `image` content blocks
- **ACP client handlers** for `fs/read_text_file`, `fs/write_text_file`, and `terminal/*`
- **Turn-complete fallback** so the full assistant answer is shown after tools
- Product branding: **AgentX** with English label **codename AbeX** (title bar, status bar, cover)
- Unit tests for incomplete-plan detection, prompt image blocks, and FS handlers

### Fixed

- Windows **ENOENT crash** when the agent ran full PowerShell one-liners as the executable name
- Chat stuck on **Grok · working…** with no activity (cancel-before-every-prompt removed; quieter hangs auto-stop after silence)
- Missing assistant text after tool runs (stream + final-text merge)
- Tool status spam (`tool · completed` rows) — update in place by `toolCallId`
- Tool permission hangs without CLI `--always-approve` when auto-approve is on
- Workspace package/file visibility via proper ACP filesystem responses

### Changed

- Preferences stored under `~/.agentx/settings.json` (always-approve, auto-continue, plan-first, show-thinking)
- README reorganized with features, tips, and this changelog link

## [1.0.0] — 2026-07-14

### Added

- Initial public release: Electron + React + Monaco shell over `grok agent stdio`
- File explorer, multi-tab editor, Grok chat, settings, status bar
- Permission UI + always-approve toggle
- Diff review panel (apply / reject)
- Integrated terminal panel
- Windows packaging via electron-builder (`npm run pack` / `npm run dist`)
- Auth via existing Grok CLI session (`~/.grok/auth.json`)

---

[1.1.0]: https://github.com/prangishviliAbe/AgentX/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/prangishviliAbe/AgentX/releases/tag/v1.0.0
