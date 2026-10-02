# Cache TTL Button: Notes

Goal: a button in our custom VS Code extension that switches the prompt cache TTL of Claude Code between `5m` and `1h`.

Status: implemented in IFS and tested. See chapter 7.

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
- **Timing:** both approaches probably only take effect for new sessions. The env var is read when the Claude process starts. Verified for the env var: new sessions and forks pick up the change, and a running session keeps its TTL. No window reload is needed.
- **Displayed state:** the button can show what it set, not the effective TTL. A control with higher precedence can still override it. The effective TTL is shown by `/usage`.

## 3. Verification

The recommendation was based on memory, not on research. These details were verified against the `package.json` of the installed Claude Code extension (2.1.287):

- **Setting ID ✓** `claudeCode.environmentVariables`.
- **Value shape ✓** an array of `{ "name": ..., "value": ... }` objects. Both fields are required strings, and the default is `[]`. Merge our entry into it; never replace the whole array.
- **Scope ✓** `machine`. The setting can only be set in user (or remote) settings, never per workspace.
- **Version ✓** 2.1.287 is installed; the controls require 2.1.242 or later.
- **Note:** the setting's description says "Prefer setting environment variables in Claude's settings.json." This does not change the recommendation.
- **Reset:** to return to the default, remove the entry instead of writing `1h`. Writing `1h` would also pin `1h` after the subscription switches to usage credits.

## 4. Background: TTL controls in Claude Code

Researched from the official docs (see chapter 6).

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
- **VS Code cache clock:** if it counts down from more than 5 minutes, `1h` is in effect. Observed: the cache clock in the Claude Code panel shows `5m` or `60m`.

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

## 7. Implementation

Terminology: the "button" in this document is the **prompt cache TTL status bar item**.

### 7.1 What was built

- **File:** `src/prompt_cache_TTL_status_bar_item.ts`. `activate()` calls `create_prompt_cache_TTL_status_bar_item()` right after `IFS_notifier.initialize()`, so the item never waits for the tree setup.
- **Command:** `ifs.toggle_prompt_cache_TTL`. It is not contributed in `package.json`.
- **Labels:** `Cache: 5m` while our entry is set, `Cache: *60m` while it is not. The asterisk marks the small print, which the tooltip explains: `60m` is the default only within plan usage.
- **Toggle:** adds our entry with `5m`, or removes it. All other entries stay untouched. When no entries are left, the key is removed.
- **Reading:** `inspect(...).globalValue` only, because the toggle writes to the User (Global) scope.
- **Visibility:** only while the extension `anthropic.claude-code` is installed and enabled. The item follows `vscode.extensions.onDidChange` live.

### 7.2 Test results

- Switch to `5m` → new session → cache clock `5m`. ✓
- Switch back to the default → new session → cache clock `60m`. ✓
- A running session keeps its TTL, even after a switch and a new message. A fork picks up the current value. ✓

### 7.3 Open items

- **The `env` key in Claude Code settings:** could an `env` entry in a project `.claude/settings.json` override the variable that VS Code passes in? If so, the claim in 1.1 does not fully hold. Unverified.
- **Untested paths:** the hide path (disabling Claude Code), the error path (Claude Code missing), and a VS Code restart.
