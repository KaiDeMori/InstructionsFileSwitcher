export const EXTENSION_ID = 'ifs';
export const INSTRUCTION_FILE_EXTENSION = '.instructions.md';
export const IFS_DEACTIVATED_EXTENSION = '.instructions.IFS_DEACTIVATED.md';
export const TREE_VIEW_ID = `${EXTENSION_ID}TreeView`;
export const TOGGLE_CHECKBOX_COMMAND = `${EXTENSION_ID}.toggleCheckbox`;
export const SET_USER_PATH_COMMAND = `${EXTENSION_ID}.setUserPath`;
export const MANAGE_PROFILES_COMMAND = `${EXTENSION_ID}.manageProfiles`;
export const MANAGE_WORKSPACE_PROFILES_COMMAND = `${EXTENSION_ID}.manageWorkspaceProfiles`;
export const RENAME_INSTRUCTION_FILE_COMMAND = `${EXTENSION_ID}.renameInstructionFile`;
export const OPEN_INSTRUCTION_FILE_COMMAND = `${EXTENSION_ID}.openInstructionFile`;
export const OPEN_CONFIG_COMMAND = `${EXTENSION_ID}.openConfig`;
export const OPEN_PATH_IN_EXPLORER_COMMAND = `${EXTENSION_ID}.openPathInExplorer`;
export const REFRESH_TREE_COMMAND = `${EXTENSION_ID}.refreshTree`;
export const RESET_SETTINGS_COMMAND = `${EXTENSION_ID}.resetSettings`;
export const CONFIG_SECTION = EXTENSION_ID;
export const USER_PATH_CONFIG_KEY = 'paths.user';
export const USER_PATH_CONFIG = `${CONFIG_SECTION}.${USER_PATH_CONFIG_KEY}`;
export const TREE_ITEM_FOLDER_CONTEXT = `${EXTENSION_ID}Folder`;
export const TREE_ITEM_FILE_CONTEXT = `${EXTENSION_ID}File`;
export const TREE_ITEM_ROOT_CONTEXT = `${EXTENSION_ID}Root`;
export const USER_PATH_ROOT_KEY = 'user_path_root';
export const IFS_USER_PATH_ROOT = `ifs_${USER_PATH_ROOT_KEY}`;

export const WORKSPACE_TREE_VIEW_ID_PREFIX = `${EXTENSION_ID}WorkspaceTreeView`;
export const SET_WORKSPACE_PATH_COMMAND_PREFIX = `${EXTENSION_ID}.setWorkspacePath`;
// On-disk settings key is `paths.additional` (formerly `paths.workspace`).
// All IFS settings live in the User (Global) scope; the "workspace" wording
// in the TS identifier is historical and kept to avoid a wide refactor.
export const WORKSPACE_PATH_CONFIG_KEY = 'paths.additional';
export const WORKSPACE_PATH_CONFIG = `${CONFIG_SECTION}.${WORKSPACE_PATH_CONFIG_KEY}`;
export const WORKSPACE_PATH_ROOT_KEY_PREFIX = 'ifs_workspace_path_root';

export const ADDITIONAL_PATHS_CONFIG_KEY = 'additionalPaths';
export const ADDITIONAL_PATHS_DEFAULT = 1;

export const NOTIFICATIONS_HIDE_ALL_CONFIG_KEY = 'notifications.hideAll';
export const LOGGING_ENABLED_CONFIG_KEY = 'logging.enabled';
export const WORKSPACE_TREE_VIEW_HARD_LIMIT = 10;
export const WORKSPACE_VIEW_COUNT_CONTEXT_KEY = `${EXTENSION_ID}.workspaceViewCount`;

export const PROFILES_CONFIG_KEY = 'profiles';
export const USER_PROFILES_CONFIG_KEY = 'profiles.user';
// On-disk settings key is `profiles.additional` (formerly `profiles.workspace`).
export const WORKSPACE_PROFILES_CONFIG_KEY = 'profiles.additional';
export const PROFILE_ID_PROPERTY = 'id';
export const PROFILE_LABEL_PROPERTY = 'label';
export const PROFILE_USER_PATH_PROPERTY = 'userPath';
export const PROFILE_CHECKED_PATHS_PROPERTY = 'checkedPaths';

export const COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH = '.copilot/instructions';
export const VSCODE_STABLE_PROMPTS_RELATIVE_PATH_WINDOWS = 'Code/User/prompts';
export const VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_WINDOWS = 'Code - Insiders/User/prompts';
export const VSCODE_STABLE_PROMPTS_RELATIVE_PATH_MAC = 'Library/Application Support/Code/User/prompts';
export const VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_MAC = 'Library/Application Support/Code - Insiders/User/prompts';
export const VSCODE_STABLE_PROMPTS_RELATIVE_PATH_LINUX = '.config/Code/User/prompts';
export const VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_LINUX = '.config/Code - Insiders/User/prompts';