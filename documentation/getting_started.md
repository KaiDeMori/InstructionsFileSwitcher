# Getting Started

Welcome to **Instruction Files Switcher** (IFS). This page walks you through installation and the very first time you open VS Code with the extension active.

# Installation

Install IFS like any other VS Code extension. No reload is required — it activates automatically when VS Code finishes starting up.

# What to expect on first launch

When IFS activates, it tries to find an instruction folder for you. The behavior depends on what it finds on disk:

## Case A — One known instruction folder is found

IFS silently picks it as your **User Path** and shows it in the **IFS** view in the Activity Bar (left sidebar). Nothing else happens. You are ready to go.

## Case B — Multiple known instruction folders are found

IFS shows a Quick Pick titled **Select Primary USER PATH**. You will see a list of all instruction folders IFS auto-detected on your system (for example, the VS Code Stable prompts folder and the VS Code Insiders prompts folder).

Pick the one you want IFS to manage as your User Path. The choice is saved to your settings, so this dialog will not appear again unless your configured path becomes invalid.

## Case C — No instruction folder is found

IFS does nothing intrusive. The **IFS User** view in the Activity Bar will appear empty. You can configure a path manually later (see [configuration.md](configuration.md)).

# The IFS view

After activation, look at the Activity Bar on the left. There is a new icon labeled **IFS**. Click it to reveal:

- **IFS User** — your personal instruction files tree.
- **IFS Workspace 1..N** — one tree per workspace-related instruction path that IFS auto-detected or that you configured manually. These are collapsed by default.

Each tree shows the subfolders of its configured path. Files with the `.instructions.md` extension are shown with a checkbox. A checked file is **active** — it keeps the `.instructions.md` extension, so VS Code reads it. An unchecked file is **inactive** — IFS renames its extension to `.instructions.IFS_DEACTIVATED.md`, so VS Code ignores it. Files never move on disk; only the extension changes.

That is the entire mental model.
