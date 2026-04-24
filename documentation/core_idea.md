# The Core Idea

VS Code only treats a file as an instruction file if its name ends in `.instructions.md`. Anything else — even something like `my_notes.instructions.IFS_DEACTIVATED.md` — is ignored. IFS uses exactly that fact.

# How it works in one sentence

When you check a file in the IFS tree, IFS makes sure its extension is `.instructions.md` so VS Code picks it up. When you uncheck it, IFS renames the extension to `.instructions.IFS_DEACTIVATED.md` so VS Code ignores it. The file never moves — it stays exactly where you put it on disk, in whatever folder structure you like.

# Where IFS looks for instruction folders

Most users never touch the **Chat: Instructions Files Locations** setting in VS Code, and most users do not know that VS Code also reads instruction files from a hard-coded "prompts" folder under the user profile directory. IFS knows about both.

On startup, IFS looks in three places, in this order:

1. **The path you configured in IFS settings** (`ifs.paths.user`). If it exists on disk, IFS uses it.
2. **Hard-coded VS Code prompt folders** for the current operating system:
	- Windows: `%APPDATA%/Code/User/prompts` and `%APPDATA%/Code - Insiders/User/prompts`
	- macOS: `~/Library/Application Support/Code/User/prompts` and `~/Library/Application Support/Code - Insiders/User/prompts`
	- Linux: `~/.config/Code/User/prompts` and `~/.config/Code - Insiders/User/prompts`
	- All OSes: `~/.copilot/instructions`
3. **Workspace-level instruction folders** declared in VS Code's `chat.instructionsFilesLocations` setting. These get their own tree view per entry.

If more than one User-level folder is found, IFS asks you to pick one as the primary (see [getting_started.md](getting_started.md)). All other detected folders show up as additional Workspace tree views in the IFS Activity Bar so you can manage them too.

# Why the tree has multiple views

Because instruction files can live in several "scopes" at once — your personal user prompts, an Insiders install, a workspace-relative `.github/instructions` folder, and so on. Each scope gets its own tree so you can switch them independently without confusing yourself about which file ended up where.
