# Features

This page lists what IFS can do, grouped by where you find each feature in the UI.

# The Activity Bar view

IFS adds an icon to the Activity Bar called **IFS**. Clicking it opens a sidebar with one or more tree views.

## User tree view

The primary tree, called **IFS User**, manages your personal instruction folder (the User Path). Subfolders are shown as collapsible nodes; `.instructions.md` files are shown as leaves with a checkbox.

## Workspace tree views

Up to ten additional trees, called **IFS Workspace 1** through **IFS Workspace 10**, manage other instruction folders that IFS auto-detected or that you configured manually. Each one operates independently. Empty slots appear as collapsed, unused trees so you can configure new paths without changing settings by hand.

The maximum of ten is hard-coded and cannot be changed.

# Activating and deactivating files

A checked file is **active** — its `.instructions.md` extension is intact, so VS Code reads it.

An unchecked file is **inactive** — its extension is renamed to `.instructions.IFS_DEACTIVATED.md`, so VS Code ignores it. The file stays where it is on disk; only the extension changes.

Toggling the checkbox runs both operations atomically. There is no separate "save" step.

# Profiles

A profile is a named snapshot of which files are currently active in a tree. Profiles let you switch contexts in one click — for example *"Writing mode"*, *"Refactoring mode"*, *"Vacation"*.

Open the profile picker via the icon in the tree title bar. From there you can:

- Activate a saved profile (which checks/unchecks files to match the snapshot).
- **Add Profile** — save the current tree state as a new named profile.
- Rename a profile (edit icon on the right of each entry).
- Delete a profile (trash icon).

User profiles and Workspace-tree profiles are stored under separate settings keys (`ifs.profiles.user` and `ifs.profiles.additional`), but both live at the User (Global) scope and follow you across windows.

# Per-item actions

Hover over a tree item to reveal inline action buttons.

## On a file

- **Open** — opens the instruction file in the editor.
- **Rename** — renames the file on disk. The new name keeps the active or deactivated extension automatically.

## On a folder or the root

- **Open Folder in Explorer** — reveals the folder in your operating system's file manager.

# Toolbar actions

At the top of each IFS tree view:

- **Refresh** — re-scans the configured path and rebuilds the tree.
- **Profiles** (User tree) / **Workspace Profiles** (Workspace trees) — opens the profile picker.
- **Open Config** — jumps to the IFS section in VS Code Settings.
- **Reset…** — opens a Quick Pick to wipe IFS settings (User path, Workspace paths, profiles, …) with confirmation.

# Auto-detection of instruction folders

On startup, IFS scans known instruction-folder locations for the current operating system and adds them as trees automatically. See [core_idea.md](core_idea.md) for the list. You do not need to configure anything to get started.

# Notifications and logging

IFS shows non-intrusive notifications for warnings and confirmations. You can silence the chatter by enabling **Hide all IFS notification popups** in settings. Errors and modal confirmations are always shown.

For diagnostics, enable **logging** in settings — IFS will write messages to an **IFS** Output channel and auto-reveal it on errors.

# Cross-platform support

IFS knows the conventional VS Code prompt-folder locations for Windows, macOS, and Linux, as well as the Insiders variants on each. It also handles paths written with `~` (home directory) or relative to the workspace.
