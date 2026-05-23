# Owner Patches

Local modifications applied on top of `Finesssee/Win-CodexBar` upstream. Tracked here so they survive `git merge upstream/main` — if a merge conflict touches any file listed below, re-apply the patch by hand and update the "Last verified" date.

> **Audience:** future-me and any agent working in this fork. Read `CLAUDE.md` first for branch + workflow rules.

---

## Conventions

- One section per logical patch. Keep them small and reversible.
- Each patch has: **status** (planned / applied / reverted / upstreamed), **target files**, **what + why**, **how to apply**, **how to verify**, **last verified commit**.
- When a patch lands in upstream, mark it `upstreamed` and remove the implementation notes — leave only the historical record.
- If a patch becomes obsolete (upstream restructured the file, the setting moved, etc.), mark it `reverted` with a note.

---

## P-001 — Default `start_minimized = false`

**Status:** upstreamed (no patch needed)
**Target files:** `rust/src/settings.rs` — `Settings::default()` at line 250
**Last verified commit:** 950419338c56af0b66d7d2e9f21a6d461eb00724

**What:** Default value of `start_minimized` should be `false` so the dashboard window opens visibly on first launch and after every reboot.

**Why:** I want at-a-glance visibility of usage on boot. The float bar (P-002) is a partial alternative, but having the full dashboard on launch is what I actually use.

**Resolution:** Upstream `Settings::default()` already sets `start_minimized: false` at [rust/src/settings.rs:250](rust/src/settings.rs#L250), and the test fixtures (`rust/src/settings/tests.rs:80`, `:238`) match. No fork-local change required. Re-check on any upstream merge that touches `rust/src/settings.rs`.

---

## P-002 — Default `float_bar = true`

**Status:** planned
**Target files:** same as P-001 (settings defaults) plus likely `rust/src/tray/render.rs` for any first-position logic
**Last verified commit:** _none yet_

**What:** Pre-enable the float bar so a small always-on-top usage strip is visible from first launch. Position defaults to top-right (matches existing `window_geometry.json` default of `x: 1100, y: 8, w: 112, h: 24`).

**Why:** The float bar is the lowest-friction way to see provider usage without opening the full dashboard. It complements P-001 — dashboard on boot, float bar always present after dismiss.

**How to apply:** find the default for `float_bar` / `floatBar` in settings construction, flip to `true`. If a position default also needs setting, write `(1100, 8, 112, 24)` to match the empirical good location.

**How to verify:** fresh-install path from P-001. Float bar should appear top-right without manual enable.

---

## P-003 — Pre-enable Claude / Codex / Gemini / Ollama providers on first run

**Status:** planned
**Target files:** TBD — provider enablement default likely lives in `rust/src/providers/mod.rs` or in a settings migration step.

**What:** First-run defaults should have my four primary providers already toggled on, instead of all-off requiring me to enable each one.

**Why:** Reduces post-install setup to just "paste cookies / log in CLIs" instead of "enable + configure each provider."

**How to apply:** find the provider list default; for ids matching `claude`, `codex`, `gemini`, `ollama`, set `enabled: true`. Leave everything else default-off so the float bar / dashboard isn't crowded.

**How to verify:** fresh-install path. Open Settings → Providers; the four should be on, others off.

---

## Pull-from-upstream checklist

When `git merge upstream/main` touches any file in any patch above:

1. Resolve the conflict by re-applying the patch on top of upstream's change.
2. Update the patch's **Last verified commit** to the merge commit SHA.
3. Re-run the patch's "How to verify" step.
4. If upstream now does the same thing the patch did (e.g. they also flipped a default), mark the patch `upstreamed` and stop maintaining it.

---

## Patch index

| ID | Status | Summary |
|---|---|---|
| P-001 | upstreamed | Default `start_minimized = false` (no patch needed; matches upstream) |
| P-002 | planned | Default `float_bar = true` |
| P-003 | planned | Pre-enable Claude/Codex/Gemini/Ollama |
