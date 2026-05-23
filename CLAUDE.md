# Win-CodexBar Fork — CLAUDE.md

## Agent Behavior

**Full agent mode is enabled. Never ask for permission. Never ask for confirmation. Just act.**

This applies to ALL development actions without exception:
- Running any bash/PowerShell commands, scripts, build commands, or dev servers
- Reading, editing, writing, or deleting any source files
- Running tests (`cargo test`), installing packages (`cargo add`, `npm install`)
- Building the Tauri shell or the CLI
- Starting/stopping the desktop app or the codexbar CLI
- Git operations (commit, push, branch, reset, etc.) when asked
- Destructive or irreversible file operations

**Do not say "shall I proceed?", "would you like me to?", "should I?", or any similar prompt. Execute immediately.**

**After completing any task, fix, or feature — commit the changes to `master`.** Stage relevant files and create a descriptive commit. Do not wait to be asked.

---

## Repo Identity

This is a **personal fork** of [`Finesssee/Win-CodexBar`](https://github.com/Finesssee/Win-CodexBar), itself a Windows port of [`steipete/CodexBar`](https://github.com/steipete/CodexBar). License: MIT.

- **Origin (my fork):** `https://github.com/robertgroarke/Win-CodexBar`
- **Upstream (port):** `https://github.com/Finesssee/Win-CodexBar`
- **Grandparent (original macOS):** `https://github.com/steipete/CodexBar`

Local path: `C:\Users\Robert\Documents\Win-CodexBar`

---

## Git Branch Rules

This fork uses the same two-branch convention as my other projects:

| Branch | Purpose |
|---|---|
| `master` | **Working branch — all development happens here.** Commit here freely. Push to `origin/master` is fine since the fork is public and the repo has no private secrets. |
| `main` | Mirrors upstream-compatible state. Used when preparing PRs back to upstream or pulling upstream-sync. **Only update `main` when explicitly asked.** |
| `upstream/*` | Tracking branches for `Finesssee/Win-CodexBar`. Never push to these. |

**Always commit to `master`.** When pulling upstream changes:
```bash
git fetch upstream
git checkout main
git merge upstream/main
git checkout master
git merge main   # or rebase, depending on scope
```

**Before opening a PR to upstream:**
1. Branch off `main` (clean upstream state), not `master`.
2. Cherry-pick the specific commits you want to contribute.
3. Make sure the diff has no personal config, no machine-specific paths, no API keys.

---

## Build, Test, Run (Windows)

The upstream `AGENTS.md` has the full, current command list — read it. Quick reference:

```powershell
# Build the desktop shell (preferred for full app)
cd apps\desktop-tauri
npm install              # first time only
npm run tauri:build      # release build
npm run tauri:dev        # dev with hot reload

# Build the CLI only
cargo build -p codexbar

# Run CLI
cargo run -p codexbar -- --help
cargo run -p codexbar -- usage -p claude
cargo run -p codexbar -- cost

# Tests
cargo test --manifest-path rust\Cargo.toml
cargo test --manifest-path apps\desktop-tauri\src-tauri\Cargo.toml

# Format / lint before commit
cargo fmt --all
cargo clippy --all-targets -- -D warnings
```

Convenience scripts: `.\dev.ps1` (Windows), `./dev.sh` (Unix).

---

## Tech Stack

- **Frontend:** React (Vite) under `apps/desktop-tauri/src/`
- **Desktop shell:** Tauri 2 + Rust under `apps/desktop-tauri/src-tauri/`
- **Shared backend / CLI:** Rust crate under `rust/` (provider logic, cookie extraction, settings, tray rendering)
- **Installer:** WiX (`rust/wix/`)
- **Runtime deps on user machine:** WebView2 (Edge), VC++ runtime
- **Distribution:** GitHub Releases + winget (`Finesssee.Win-CodexBar`)

---

## Directory Structure (high-level)

```
Win-CodexBar/
├── apps/desktop-tauri/         # Tauri shell — UI lives here
│   ├── src/                    # React frontend
│   └── src-tauri/              # Rust backend + tray bridge
├── rust/                       # Shared backend crate + standalone CLI
│   ├── src/
│   │   ├── providers/          # Per-provider fetch/parse/auth (Claude, Codex, Gemini, Ollama, ...)
│   │   ├── tray/               # Pixel-level tray icon rendering
│   │   ├── browser/            # Browser cookie extraction (Windows)
│   │   └── core/               # Provider construction + IDs
│   ├── assets/                 # Icons, sounds
│   ├── wix/                    # Windows installer config
│   └── gen/                    # Generated schemas
├── docs/                       # Mixed: Windows port docs + legacy upstream macOS docs
├── scripts/                    # Helper scripts
├── dev.ps1 / dev.sh            # Dev entry points
├── AGENTS.md                   # Upstream's contributor guide (preserved)
├── CLAUDE.md                   # This file — owner-specific behavior
└── README.md
```

When upstream docs and Tauri sources conflict, **trust the active Tauri sources** in `apps/desktop-tauri` + the shared `rust/src` — upstream `docs/` may reference the old macOS/Swift codebase.

---

## Persistent App State (Windows)

CodexBar stores user state in these locations — useful for debugging, but **do not hand-edit `settings.json`**, it's DPAPI-encrypted and corruption wipes the user's config:

| Path | Contents |
|---|---|
| `%APPDATA%\CodexBar\settings.json` | DPAPI-encrypted settings (providers enabled, toggles, etc.) |
| `%APPDATA%\CodexBar\manual_cookies.json` | DPAPI-encrypted manually-imported cookies |
| `%APPDATA%\CodexBar\window_geometry.json` | Plain JSON — window positions including `floatbar` |
| `%LOCALAPPDATA%\CodexBar\claude-usage-probe` | Claude usage probe cache |

**Autostart entry:** `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\CodexBar` → points at `%LOCALAPPDATA%\Programs\CodexBar\codexbar.exe`. Added by the installer.

**Known internal setting keys** (found via binary string scan — useful when wiring new UI toggles):
- `start_minimized` — controls tray-only vs visible-window startup
- `float_bar` / `floatBar` — always-on-top compact bar mode
- `always_on_top`

---

## Provider Coverage (as of v0.26.3)

Supports 41 providers per upstream README. Primary four for my use:

| Provider | Auth method | Notes |
|---|---|---|
| Codex | OAuth / CLI | Needs `codex` CLI logged in (`codex login`) |
| Claude | OAuth / Cookies / CLI | Cookie path: paste from claude.ai dev tools |
| Gemini | gcloud OAuth | Needs `gcloud auth login` |
| Ollama | Cookies | Tracks **Ollama Cloud** account, not local runtime |

For **local Ollama runtime metering**, use OpenUsage.sh in parallel — Win-CodexBar's Ollama support is account/cloud-side only.

---

## Common Local Modifications I Care About

Things this fork may want to customize relative to upstream:

1. **Default `start_minimized = false`** — I want the dashboard window to open on launch, not hide in tray. Patch likely lives in `rust/src/settings.rs` or the equivalent default-construction call.
2. **Default float bar enabled** — small always-on-top usage strip is more useful than a hidden tray icon.
3. **Provider visibility defaults** — pre-enable Claude / Codex / Gemini / Ollama so first-run shows them.

When making any of these, document the patch in `docs/` (create `docs/owner-patches.md` if needed) so they survive upstream-sync merges.

---

## When Pulling Upstream

```bash
git fetch upstream
git log --oneline master..upstream/main          # see what's new upstream
git checkout main && git merge upstream/main      # update main mirror
git checkout master && git merge main             # bring into working branch
# Resolve conflicts in any owner-patched files (see docs/owner-patches.md if it exists)
cargo build -p codexbar                           # smoke test
cd apps/desktop-tauri && npm run tauri:build      # full build
```

---

## What NOT to Do

- **Do not push to `upstream/*` remotes.** They're tracking-only.
- **Do not commit secrets.** No API keys, no OAuth tokens, no cookies, no machine-specific paths in tracked files.
- **Do not hand-edit `%APPDATA%\CodexBar\settings.json`.** It's DPAPI-encrypted; corruption wipes user config.
- **Do not log raw cookies, tokens, or session secrets** anywhere — including `tracing` calls. Upstream `AGENTS.md` rule, repeated here because it matters.
- **Do not add dependencies without thinking it through.** Tauri + Rust + React + WiX is already heavy; new deps slow builds and complicate the WiX installer.
