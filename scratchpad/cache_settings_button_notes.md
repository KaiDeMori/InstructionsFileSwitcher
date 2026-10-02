# Cache TTL Button: Notes

Date: 2026-10-01

Goal: a button in our custom VS Code extension that switches the prompt cache TTL of Claude Code between `5m` and `1h`.

## 1. Recommendation

Set the env var `CLAUDE_CODE_PROMPT_CACHE_TTL` through the `environmentVariables` VS Code setting of the Claude Code extension.
Write it with `vscode.workspace.getConfiguration().update()`.

### 1.1 Why it is more reliable

- **Precedence:** the env var beats `promptCacheTtl` in every settings scope (user, project, local). A project `.claude/settings.json` cannot silently override the button. Only `FORCE_PROMPT_CACHING_5M=1` still wins.
- **Safe write path:** the VS Code configuration API handles JSONC, scopes and concurrent writes. The settings approach means parsing and rewriting `~/.claude/settings.json` ourselves. Claude Code also writes to that file (permissions, `/config`), which risks races and clobbered keys.
- **No file handling:** no path resolution, no JSON merge, no error handling for a broken file.

### 1.2 Why it is easier

It takes one API call plus a small array merge.
The settings approach needs file I/O, JSON parsing and merging.

## 2. Trade-offs

- **Scope:** the env var only affects the VS Code extension, not the CLI in a terminal. If the button must control both, use `promptCacheTtl` in `~/.claude/settings.json` instead.
- **Timing:** both approaches probably only take effect for new sessions. The env var is read when the Claude process starts.
- **Displayed state:** the button can show what it set, not the effective TTL. A control with higher precedence can still override it. The effective TTL is shown by `/usage`.

## 3. To verify before implementing

The recommendation is based on memory, not on research. These details are unverified:

- **Setting ID:** probably `claudeCode.environmentVariables`. Check the name in the Settings UI.
- **Value shape:** probably an array of `{ "name": ..., "value": ... }` objects. Merge our entry into it; never replace the whole array.
- **Reset:** to return to the default, remove the entry instead of writing `1h`. Writing `1h` would also pin `1h` after the subscription switches to usage credits.

## 4. Background: TTL controls in Claude Code

Researched on 2026-10-01 from the official docs (see chapter 6).

### 4.1 Values

Only `5m` and `1h` exist.
Claude Code ignores any other value.
The controls require Claude Code v2.1.242 or later.

### 4.2 Defaults

| Bucket | Subscription, within plan usage | Usage credits, API key, cloud provider |
| :- | :- | :- |
| Main conversation | `1h` | `5m` |
| Everything else (subagents, compaction, session titles) | `5m` | `5m` |

### 4.3 Controls

| Name | Kind | Effect |
| :- | :- | :- |
| `promptCacheTtl` | settings.json key | TTL of the main conversation |
| `subagentPromptCacheTtl` | settings.json key | TTL of everything else |
| `CLAUDE_CODE_PROMPT_CACHE_TTL` | env var | TTL of the main conversation, overrides `promptCacheTtl` |
| `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` | env var | TTL of everything else, overrides `subagentPromptCacheTtl` |
| `FORCE_PROMPT_CACHING_5M=1` | env var | Forces `5m` for both buckets, overrides everything |
| `ENABLE_PROMPT_CACHING_1H=1` | env var | Requests `1h` (the docs disagree on whether this covers one bucket or both) |
| `experimental.cacheTtl` | subagent frontmatter | Per-agent TTL, used only when no subagent TTL setting is set |

### 4.4 Precedence

First match wins:

1. `FORCE_PROMPT_CACHING_5M=1`
2. The bucket's env var
3. The bucket's setting
4. For subagent requests: `experimental.cacheTtl` in the subagent's frontmatter
5. `ENABLE_PROMPT_CACHING_1H=1`
6. The bucket's default

### 4.5 Checking the effective TTL

- **`/usage`:** the `Prompt cache (main)` line shows the TTL in effect.
- **VS Code cache clock:** if it counts down from more than 5 minutes, `1h` is in effect.

## 5. Alternative: `promptCacheTtl` in `~/.claude/settings.json`

Use this alternative only if the button must also control the CLI.
In that case:

- Read, merge and write the file; never overwrite it.
- Expect a project or local `.claude/settings.json` to override the user value.
- Expect the env var `CLAUDE_CODE_PROMPT_CACHE_TTL` to override it.

## 6. Sources

- [Prompt caching](https://code.claude.com/docs/en/prompt-caching)
- [Settings reference](https://code.claude.com/docs/en/settings-reference)
- [Environment variables](https://code.claude.com/docs/en/env-vars)
- [VS Code extension](https://code.claude.com/docs/en/vs-code)
