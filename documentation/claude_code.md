# Using IFS with Claude Code

IFS was built for the GitHub Copilot extension, which discovers `.instructions.md` files on its own. Claude Code does not do that — its native context comes from `CLAUDE.md`, memory files, and `@`-imports, and it has no concept of Copilot's `.instructions.md` convention. This page shows a small, honest workaround that lets the *same* IFS checkboxes drive Claude Code too.

Further down, this page also covers the status bar item that switches Claude Code's prompt cache TTL with one click. See [Switching the prompt cache TTL](#switching-the-prompt-cache-ttl).

# The idea in one sentence

A Claude Code `SessionStart` hook reads every **active** `.instructions.md` file and pastes its contents into the chat at the start of a session — and because IFS deactivates a file by renaming it to `.instructions.IFS_DEACTIVATED.md`, the hook's `*.instructions.md` glob naturally skips deactivated files. One checkbox, two tools.

# Why this works at all

The hook contains no "active vs. inactive" logic. It just globs `*.instructions.md`. IFS already encodes the active/inactive state in the filename (see [core_idea.md](core_idea.md)), so:

- **Active** → `garden gossip.instructions.md` → matched by the glob → injected.
- **Inactive** → `garden gossip.instructions.IFS_DEACTIVATED.md` → not matched → skipped.

Toggling a file in the IFS tree changes what Copilot sees *and* what this hook feeds Claude Code, with no extra wiring. In that sense IFS is not really a "Copilot tool" — it is a tool-agnostic switch over files on disk, and the hook is just one more consumer of that state.

# The hook

Claude Code reads hooks from `settings.json`. User-wide settings live at:

- Windows: `%USERPROFILE%\.claude\settings.json`
- macOS / Linux: `~/.claude/settings.json`

Add a `SessionStart` hook. The example below injects two folders: your personal user-level instruction folder, and the `.github/instructions` folder of whatever project you have open.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|compact|clear",
        "hooks": [
          {
            "type": "command",
            "command": "shopt -s nullglob globstar; for f in <YOUR_INSTRUCTIONS_FOLDER>/**/*.instructions.md; do echo \"<<< INSTRUCTION FILE: $f >>>\"; cat \"$f\"; echo; done"
          },
          {
            "type": "command",
            "command": "shopt -s nullglob globstar; for f in \"${CLAUDE_PROJECT_DIR:-.}\"/.github/instructions/**/*.instructions.md; do echo \"<<< PROJECT INSTRUCTION: $f >>>\"; cat \"$f\"; echo; done"
          }
        ]
      }
    ]
  }
}
```

Replace `<YOUR_INSTRUCTIONS_FOLDER>` with the User Path you manage in IFS (the folder shown in the **IFS User** tree).

## What each piece does

- **`matcher: "startup|compact|clear"`** — runs the hook when a session starts, after the context is compacted, and after you run `/clear`. This re-injects the instructions so they survive context resets.
- **`shopt -s nullglob globstar`** — `globstar` lets `**` recurse into the nested subfolders IFS supports; `nullglob` makes the loop do nothing (instead of printing a literal `*` pattern) when no files match.
- **The `for … cat` loop** — prints each active file wrapped in a header marker (`<<< INSTRUCTION FILE: … >>>`) so Claude can tell the files apart.
- **`${CLAUDE_PROJECT_DIR:-.}`** — Claude Code sets `CLAUDE_PROJECT_DIR` to the open project's root; the `:-.` falls back to the current directory. Because this is dynamic, the *second* command works for **every** project you open without editing the path — any repo with a `.github/instructions` folder is covered.

You can keep both commands in user settings (simplest), or move the project-level one into a committed `.claude/settings.json` inside a repo so collaborators inherit it automatically.

# Windows note

Claude Code runs hook commands through **Git Bash** on Windows, so use Git Bash path syntax, not Windows paths:

- `C:\Users\you\my instructions` → `/c/Users/you/my instructions`

The `shopt`/`globstar` features are bash-specific; on macOS and Linux they work with the default hook shell out of the box.

# Honest caveats

This is a bridge, not a perfect re-implementation of Copilot's behavior. Know the differences:

- **`applyTo:` is ignored.** Copilot uses the `applyTo` frontmatter to scope an instruction to certain files. The hook injects file contents verbatim, every time, regardless of `applyTo`. This is fine for general instructions (`applyTo: '**'`) but means file-scoped instructions are always present, not conditionally applied.
- **Changes are not live.** The hook only fires on `startup`, `compact`, and `clear`. If you toggle a file in IFS during an active Claude Code session, the context does **not** update — run `/clear` or restart the session to pick up the change. (Copilot, by contrast, reacts immediately.)
- **The YAML frontmatter is injected too.** The `---` block at the top of each file ends up in the chat verbatim. It is harmless, just not hidden.
- **Everything active is always loaded.** There is no per-file or per-prompt selection at chat time — your active set *is* your context. Use IFS profiles to switch sets, then `/clear` to apply.

# How to use it day to day

1. Manage your instruction files in the IFS sidebar exactly as you do for Copilot.
2. Check the files you want Claude Code to see; uncheck the rest (or switch a profile).
3. Start a fresh Claude Code session (or `/clear` an existing one). The active files are injected automatically.

# Switching the prompt cache TTL

Claude Code caches your prompt so that follow-up requests are faster and cheaper. How long that cache lives is the prompt cache TTL. Claude Code knows exactly two values: `5m` and `1h`.

IFS adds a status bar item at the bottom of the VS Code window that switches the TTL with one click:

- **`Cache: 5m`** → IFS has set the TTL to 5 minutes.
- **`Cache: *60m`** → IFS has set nothing, so Claude Code uses its default. As of October 2026, that default is 60 minutes with a subscription within your plan usage. The asterisk marks the small print: with usage credits, an API key or a cloud provider, the default is 5 minutes. The tooltip says so too.

The item only appears while the Claude Code extension is installed and enabled. Switching the TTL requires Claude Code 2.1.242 or later.

## How it works

The item writes the environment variable `CLAUDE_CODE_PROMPT_CACHE_TTL` into the Claude Code extension's `claudeCode.environmentVariables` setting, in your User (Global) settings. The Claude Code extension sets these variables each time it starts a session.

- **Switching to `5m`** adds the entry `{ "name": "CLAUDE_CODE_PROMPT_CACHE_TTL", "value": "5m" }`.
- **Switching back to `*60m`** removes that entry again. IFS deliberately never writes `1h`, so Claude Code's own default stays in charge.
- **Other entries** in `claudeCode.environmentVariables` are never touched.

## Honest caveats

- **New sessions only.** The variable is read when a session starts, and a running session keeps its TTL. Start a new session, or fork the current one, to pick up the change.
- **The item shows what IFS set, not the effective TTL.** A control with higher precedence can still override it, for example `FORCE_PROMPT_CACHING_5M=1`. The cache clock in the Claude Code panel and the `Prompt cache (main)` line of `/usage` show the TTL that is really in effect.
- **VS Code only.** The setting reaches Claude Code inside VS Code, not the CLI in a terminal.
- **The setting outlives IFS.** If you disable or uninstall IFS while `5m` is set, the entry stays, and Claude Code keeps using `5m`. Switch back to `*60m` first, or remove the entry from your User `settings.json` by hand.
