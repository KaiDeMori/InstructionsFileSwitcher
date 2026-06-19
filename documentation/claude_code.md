# Using IFS with Claude Code

IFS was built for the GitHub Copilot extension, which discovers `.instructions.md` files on its own. Claude Code does not do that — its native context comes from `CLAUDE.md`, memory files, and `@`-imports, and it has no concept of Copilot's `.instructions.md` convention. This page shows a small, honest workaround that lets the *same* IFS checkboxes drive Claude Code too.

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
4. Verify by looking at the session start — you will see each file printed under its `<<< INSTRUCTION FILE: … >>>` header.
