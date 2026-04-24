# Configuration

IFS is configured through standard VS Code settings. You can edit them via the Settings UI or directly in `settings.json`.

# Where IFS settings live

All `ifs.*` settings live in your **User (Global)** settings. They follow your VS Code installation across every window and workspace.

In `package.json` each `ifs.*` setting declares `"scope": "application"`, which means the VS Code Settings UI does **not** show a Workspace tab for these — there is no way to accidentally create a workspace-local override. When IFS itself writes a value (for example when you set the User Path or save a profile), it always writes to the User (Global) scope, regardless of whether a workspace is open.

If you want to inspect or hand-edit the raw values, open your User `settings.json` (Command Palette → **Preferences: Open User Settings (JSON)**).

# Opening the settings

You have three options:

- Run the **IFS: Open Config** command from the Command Palette.
- Click the **Open Config** entry in the `…` menu of any IFS tree view.
- Open VS Code Settings manually and search for `ifs`.

# Settings reference

## `ifs.paths.user`

Type: string. Default: empty. Scope: application (User).

Absolute path to your primary instruction folder. This is what the **IFS User** tree shows. If empty or invalid, IFS will try to auto-detect a path on the next startup (and may prompt you to pick one if several are found).

You normally do not edit this by hand — use the **IFS: Set User Path** command instead.

## `ifs.paths.additional`

Type: array of strings. Default: empty. Scope: application (User).

Additional instruction folders that should each get their own **IFS Workspace** tree. Useful for paths IFS does not auto-detect, or for grouping a project-specific folder into the IFS sidebar. Paths are written with forward slashes.

(Formerly `ifs.paths.workspace`. Despite the name, the IFS Workspace trees are user-scoped — they follow you across windows.)

## `ifs.additionalPaths`

Type: number (`0`–`10`). Default: `1`. Scope: application (User).

How many *spare* manual workspace path slots to show in the sidebar in addition to the auto-detected and configured ones. Spare slots appear as empty trees you can configure on the fly. Increase this number when you want more empty slots ready to go; decrease it to keep the sidebar tidy.

The combined total of auto-detected + configured + spare paths is capped at ten by the hard-coded **Workspace tree** limit (see [features.md](features.md)).

## `ifs.notifications.hideAll`

Type: boolean. Default: `false`. Scope: application (User).

When `true`, IFS suppresses informational and warning popups. Errors and modal confirmations are always shown regardless of this setting.

## `ifs.logging.enabled`

Type: boolean. Default: `false`. Scope: application (User).

When `true`, IFS writes log messages to an Output channel called **IFS**. The channel is auto-revealed when an error is logged. Enable this when reporting a bug or investigating unexpected behavior.

## `ifs.profiles.user`

Type: array of profile objects. Default: empty. Scope: application (User).

Saved profiles for the **IFS User** tree. Each profile has a `name` and a list of `active_ifs` entries (each with `absolute_path` and `basename`). You normally manage these through the **Profiles** Quick Pick — see [features.md](features.md) — but you can also edit `settings.json` directly if you want to bulk-import or hand-craft a profile.

## `ifs.profiles.additional`

Type: array of profile objects. Default: empty. Scope: application (User).

Same shape as `ifs.profiles.user`, but for the IFS Workspace trees. Stored separately from `ifs.profiles.user` to avoid mixing scopes.

(Formerly `ifs.profiles.workspace`.)

# Resetting

If your settings get into a weird state, run **IFS: Reset…** from the Command Palette (or the `…` menu of an IFS tree). It opens a Quick Pick where you can choose what to wipe — for example just the User Path, just the additional paths, just the profiles, or everything. Each destructive choice is confirmed before it runs.

For safety, **Reset…** clears the chosen keys at both the User (Global) and Workspace scopes. IFS itself only ever writes to User scope, but the Workspace pass cleans up any leftover values from older versions or from manual edits in `.vscode/settings.json`.
