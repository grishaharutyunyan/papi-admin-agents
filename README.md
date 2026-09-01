<img src="https://nrgaming.com/img/logo_big.svg" width="120">

# Team Claude Config

Shared, version-controlled **Claude Code** configuration for our team. Clone this repo,
open Claude Code inside it, and you get the same rules, plugins, and defaults as everyone else —
no manual setup.

This is a **project-scoped** config: it applies when you work *inside this repo*. Nothing here
touches your personal global `~/.claude/` config. (See [Using it in your own projects](#using-it-in-your-own-projects)
if you want the same standard elsewhere.)

## What's in here

| Path | What it does |
|------|--------------|
| `CLAUDE.md` | Team rules — the agent reads these automatically as project memory. |
| `.claude/settings.json` | Shared settings: default model, enabled plugins, marketplace source, statusline. |
| `.claude/statusline-command.sh` | Custom status line (model name + context-usage bar). |
| `.claude/settings.local.json.example` | Template for **personal** overrides (model, permission toggles). |
| `.gitignore` | Keeps personal/secret/session files out of git. |

## Quick start

1. **Install Claude Code** if you haven't: https://docs.claude.com/en/docs/claude-code
2. **Clone** this repo and open a terminal in it.
3. **Run** `claude` inside the repo directory.
4. On first launch Claude Code reads `.claude/settings.json` and **auto-installs the enabled
   plugins** from the `claude-plugins-official` marketplace. Approve the trust prompt for the
   project when asked.
5. That's it — rules and plugins are active.

## Plugins included

All from the official `anthropics/claude-plugins-official` marketplace (referenced in
`settings.json`, installed on demand — not vendored into this repo):

- `skill-creator` · `superpowers` · `context7` · `playwright` · `code-review`
- `claude-md-management` · `security-guidance` · `chrome-devtools-mcp` · `notion`

To add/remove a plugin for the whole team, edit `enabledPlugins` in `.claude/settings.json`
and commit.

## Personal overrides (optional)

Shared `settings.json` is intentionally conservative. Anything you want just for yourself goes in
`.claude/settings.local.json`, which is **git-ignored** and never shared:

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
# then edit it
```

Things deliberately **left out** of the shared config so each person controls them:

- **Model** — not pinned by the team. Everyone uses whatever model they prefer (via `/model`,
  their global `~/.claude` config, or `"model": "..."` in their own `settings.local.json`).
- **`permissions.defaultMode: "auto"` + `skipAutoPermissionPrompt: true`** — these bypass
  permission prompts. They speed things up but weaken safety guardrails, so they are **not**
  forced on the team. Add them to your `settings.local.json` only if you understand the tradeoff.

## Using it in your own projects

Because this config is project-scoped, to apply the same standard to another repo, copy the
`.claude/` folder and `CLAUDE.md` into that repo. (A future version could ship a global-install
script if the team wants these applied everywhere via `~/.claude/`.)

## Not included (on purpose)

Secrets and machine-local state are never committed: auth tokens (`~/.claude.json`), chat history,
sessions, caches, and downloaded plugin code. See `.gitignore`.
